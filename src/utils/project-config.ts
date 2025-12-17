import path from 'path';
import fs from 'fs-extra';
import { logger } from './logger.js';

export async function updatePackageJson(
  projectPath: string,
  projectName: string
): Promise<void> {
  const packageJsonPath = path.join(projectPath, 'package.json');

  try {
    // Read the package.json file
    const packageJson = await fs.readJson(packageJsonPath);

    // Update the 'name' property
    packageJson.name = projectName;

    // Write the updated content back to the file
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  } catch (error) {
    logger.error(`Failed to update package.json for project: ${projectName}`);
    logger.debug(error as string);
    throw new Error('Could not update package.json.');
  }
}

export async function updateAppJson(
  projectPath: string,
  projectName: string,
  bundleIdentifier: string
): Promise<void> {
  const appJsonPath = path.join(projectPath, 'app.json');

  try {
    // Read the file content
    const appConfig = await fs.readJson(appJsonPath);

    // Modify the desired properties within the 'expo' object
    appConfig.expo.name = projectName;
    appConfig.expo.slug = projectName;
    appConfig.expo.scheme = projectName;

    // Update bundle identifier for iOS and Android
    if (appConfig.expo.ios) {
      appConfig.expo.ios.bundleIdentifier = bundleIdentifier;
    }
    if (appConfig.expo.android) {
      // Android package names cannot contain hyphens
      appConfig.expo.android.package = bundleIdentifier.replace(/-/g, '_');
    }

    // Write the updated content back to the file
    await fs.writeJson(appJsonPath, appConfig, { spaces: 2 });
  } catch (error) {
    logger.error(`Failed to update app.json for project: ${projectName}`);
    logger.debug(error as string);
    // Re-throw the error to stop the initialization process if app.json is crucial
    throw new Error('Could not update app.json.');
  }
}
