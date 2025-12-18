import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import {
  validateProjectName,
  validateProjectPath,
  sanitizeProjectName,
} from '../utils/validation.js';
import { copyTemplate } from '../utils/filesystem.js';
import { updatePackageJson, updateAppJson } from '../utils/project-config.js';
import {
  detectPackageManagerFromInvocation,
  installDependencies,
  getRunCommand,
  getExecCommand,
  type PackageManager,
} from '../utils/package-manager.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface InitOptions {
  template?: string;
  npm?: boolean;
  yarn?: boolean;
  pnpm?: boolean;
  bun?: boolean;
  skipInstall?: boolean;
  bundleIdentifier?: string;
  runPrebuild?: boolean;
  git?: boolean;
}

export async function initCommand(
  projectName?: string,
  options: InitOptions = {}
) {
  // Show the banner first
  logger.banner();
  logger.header('🚀 Welcome to Kynjal - Expo React Native Starter');

  try {
    // Get project name
    let finalProjectName = projectName;
    let useCurrentDirectory = false;

    // Get project name if not provided
    if (!finalProjectName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'What is your project name?',
          default: 'kynjal-app',
          validate: (input: string) => {
            if (input === '.') {
              return true; // Allow current directory
            }
            const validation = validateProjectName(input);
            return (
              validation.valid || validation.message || 'Invalid project name'
            );
          },
        },
      ]);
    finalProjectName = answers.projectName;
    }

    // Check if user wants to use current directory
    if (finalProjectName === '.') {
      useCurrentDirectory = true;
      const currentDirName = path.basename(process.cwd());

      // Validate current directory name as project name
      const nameValidation = validateProjectName(currentDirName);
      if (!nameValidation.valid) {
        logger.error(
          `Current directory name "${currentDirName}" is not a valid project name.`
        );
        logger.error(nameValidation.message!);

        // Ask for a different project name
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'Please enter a valid project name:',
            default: 'kynjal-app',
            validate: (input: string) => {
              const validation = validateProjectName(input);
              return (
                validation.valid || validation.message || 'Invalid project name'
              );
            },
          },
        ]);
        finalProjectName = answers.projectName;
      } else {
        finalProjectName = currentDirName;
      }
    }

    // Validate and sanitize project name
    const sanitizedName = sanitizeProjectName(finalProjectName ?? 'kynjal');

    // Collect missing options
    const questions: any[] = [];

    if (!options.bundleIdentifier) {
      questions.push({
        type: 'input',
        name: 'bundleIdentifier',
        message: 'What is your bundle identifier?',
        default: `com.kynjal.${sanitizedName}`,
        validate: (input: string) => {
          if (/^[a-zA-Z0-9._-]+$/.test(input)) {
            return true;
          }
          return 'Invalid bundle identifier. Use alphanumeric characters, dots, hyphens, or underscores.';
        },
      });
    }

    if (options.runPrebuild === undefined) {
      questions.push({
        type: 'confirm',
        name: 'runPrebuild',
        message: 'Do you want to run prebuild? (Generates native directories)',
        default: false,
      });
    }

    if (options.git === undefined) {
      questions.push({
        type: 'confirm',
        name: 'git',
        message: 'Do you want to initialize a git repository?',
        default: true,
      });
    }

    if (questions.length > 0) {
      const answers = await inquirer.prompt(questions);
      if (answers.bundleIdentifier) options.bundleIdentifier = answers.bundleIdentifier;
      if (answers.runPrebuild !== undefined) options.runPrebuild = answers.runPrebuild;
      if (answers.git !== undefined) options.git = answers.git;
    }

    const nameValidation = validateProjectName(finalProjectName ?? 'kynjal');
    if (!nameValidation.valid) {
      logger.error(nameValidation.message!);
      process.exit(1);
    }


    let projectPath: string;

    if (useCurrentDirectory) {
      projectPath = process.cwd();

      const files = fs.readdirSync(projectPath);
      const safeFiles = [
        '.git',
        '.gitignore',
        'README.md',
        'LICENSE',
        '.DS_Store',
      ];
      const conflictingFiles = files.filter(
        (file) => !safeFiles.includes(file)
      );

      if (conflictingFiles.length > 0) {
        logger.warn('Current directory is not empty. Found:');
        conflictingFiles.forEach((file) => logger.plain(`  ${file}`));

        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Continue anyway?',
            default: false,
          },
        ]);

        if (!proceed) {
          logger.info('Initialization cancelled.');
          process.exit(0);
        }
      }
    } else {
      projectPath = path.resolve(process.cwd(), sanitizedName);

      const pathValidation = validateProjectPath(projectPath);
      if (!pathValidation.valid) {
        logger.error(pathValidation.message!);
        process.exit(1);
      }
    }

    let packageManager: PackageManager;

    if (options.npm) packageManager = 'npm';
    else if (options.yarn) packageManager = 'yarn';
    else if (options.pnpm) packageManager = 'pnpm';
    else if (options.bun) packageManager = 'bun';
    else {
      packageManager = detectPackageManagerFromInvocation();
      logger.info(`Detected package manager: ${packageManager}`);
    }

    const spinner = ora('Creating your BNA project...').start();

    try {
      let templatePath = path.resolve(__dirname, '../../templates/start');
      if (!fs.existsSync(templatePath)) {
        templatePath = path.resolve(__dirname, '../templates/start');
      }
      await copyTemplate(templatePath, projectPath);

      await updatePackageJson(projectPath, sanitizedName);

      await updateAppJson(
        projectPath,
        sanitizedName,
        options.bundleIdentifier || `com.kynjal.${sanitizedName}`
      );

      spinner.succeed('Project created successfully!');

      if (!options.skipInstall) {
        await installDependencies(projectPath, packageManager);


      }



      const { configureEas } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configureEas',
          message: 'Would you like to configure EAS Build now? (eas build:configure)',
          default: false,
        },
      ]);

      if (configureEas) {
        const easSpinner = ora('Configuring EAS Build...').start();
        try {
          const { execSync } = await import('child_process');
          execSync('npx eas-cli build:configure', {
            cwd: projectPath,
            stdio: 'inherit'
          });
          easSpinner.succeed('EAS Build configured successfully!');
        } catch (error) {
            easSpinner.fail('Failed to configure EAS Build.');
            logger.warn('You can run "eas build:configure" manually later.');
        }
      }

      const { configureEasUpdates } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configureEasUpdates',
          message: 'Would you like to configure EAS Update? (eas update:configure)',
          default: false,
        },
      ]);

      if (configureEasUpdates) {
        const easUpdateSpinner = ora('Configuring EAS Update...').start();
        try {
            const { execSync } = await import('child_process');
            execSync('npx eas-cli update:configure', {
                cwd: projectPath,
                stdio: 'inherit'
            });

            // Post-configure logic for app.json to set strict updates policy
            // Using logic similar to provided snippet but ensuring we use fs/path properly
            const appJsonPath = path.join(projectPath, 'app.json');
            const appJsonContent = fs.readFileSync(appJsonPath, 'utf-8');
            const appJson = JSON.parse(appJsonContent);

            if (!appJson.expo.updates) {
                appJson.expo.updates = {};
            }

            const existingUpdates = appJson.expo.updates;

            // Reconstruct object to enforce order
            appJson.expo.updates = {
                url: existingUpdates.url,
                checkAutomatically: 'ON_LOAD',
                fallbackToCacheTimeout: 0,
            };

            // Set runtime version to fixed 1.0.0 as requested
            appJson.expo.runtimeVersion = '1.0.0';

            // Preserve extra EAS fields
            Object.keys(existingUpdates).forEach(key => {
                if (!['url', 'checkAutomatically', 'fallbackToCacheTimeout'].includes(key)) {
                    appJson.expo.updates[key] = existingUpdates[key];
                }
            });

            fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), 'utf-8');

            easUpdateSpinner.succeed('EAS Update configured successfully!');

            // Intelligent EAS Flow: If Build wasn't configured but Updates was, configure Build now.
            // This ensures "eas build" works since the user has now linked the project to EAS.
            if (!configureEas) {
                 const easBuildSpinner = ora('Configuring EAS Build (required for Updates)...').start();
                 try {
                     execSync('npx eas-cli build:configure', {
                         cwd: projectPath,
                         stdio: 'inherit'
                     });
                     easBuildSpinner.succeed('EAS Build configured automatically!');
                 } catch (buildError) {
                     easBuildSpinner.fail('Failed to configure EAS Build automatically.');
                     logger.warn('You should run "eas build:configure" manually.');
                 }
            }
        } catch (error) {
            easUpdateSpinner.fail('Failed to configure EAS Update.');
            logger.warn('You can run "eas update:configure" manually later.');
        }
      }

      if (options.git) {
        const { initGit, isGitInstalled } = await import('../utils/git.js');

        if (isGitInstalled()) {
          const gitSpinner = ora('Initializing git repository...').start();
          const success = initGit(projectPath);

          if (success) {
            gitSpinner.succeed('Git repository initialized!');
          } else {
            gitSpinner.info('Skipped git initialization (already initialized or failed)');
          }
        }
      }

      // Run prebuild if requested (after EAS configuration)
      if (options.runPrebuild) {
        // Only run prebuild if dependencies are installed or we are not skipping install
        if (!options.skipInstall) {
            const prebuildSpinner = ora('Running expo prebuild...').start();
            try {
              const { execSync } = await import('child_process');
              const prebuildCommand = getExecCommand(
                packageManager,
                'expo prebuild --clean'
              );

              execSync(prebuildCommand, {
                cwd: projectPath,
                stdio: 'inherit',
              });
              prebuildSpinner.succeed('Prebuild completed successfully!');
            } catch (error) {
              prebuildSpinner.fail('Failed to run prebuild.');
              logger.warn('You can run prebuild manually later.');
              logger.debug(error as string);
            }
        }
      }

      showSuccessMessage(
        sanitizedName,
        packageManager,
        options.skipInstall ?? false,
        useCurrentDirectory
      );
    } catch (error) {
      spinner.fail('Failed to create project');
      throw error;
    }
  } catch (error) {
    logger.error('An error occurred:', error);
    process.exit(1);
  }
}

function showSuccessMessage(
  projectName: string,
  packageManager: PackageManager,
  skipInstall: boolean,
  useCurrentDirectory: boolean
): void {
  logger.newline();
  logger.success(`🎉 Successfully created ${projectName}!`);
  logger.newline();

  logger.info('Next steps:');

  if (!useCurrentDirectory) {
    logger.plain(`  cd ${projectName}`);
  }

  if (skipInstall) {
    const installCommand =
      packageManager === 'npm'
        ? 'npm install'
        : packageManager === 'yarn'
        ? 'yarn'
        : packageManager === 'bun'
        ? 'bun install'
        : 'pnpm install';

    logger.plain(`  ${installCommand}`);
  }

  logger.plain(`  ${getRunCommand(packageManager, 'start')}`);
  logger.newline();

  logger.info('Available commands:');
  logger.plain(
    `  ${getRunCommand(
      packageManager,
      'start'
    )}    Start the development server`
  );
  logger.plain(`  ${getRunCommand(packageManager, 'android')}  Run on Android`);
  logger.plain(`  ${getRunCommand(packageManager, 'ios')}      Run on iOS`);
  logger.plain(`  ${getRunCommand(packageManager, 'web')}      Run on Web`);
  logger.newline();

  logger.info('Happy coding! 🚀');
}
