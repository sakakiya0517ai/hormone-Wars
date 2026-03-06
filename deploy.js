import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoUrl = 'https://github.com/sakakiya0517ai/hormone-Wars.git';

try {
    console.log('Deploying to GitHub Pages...');

    // navigate to dist directory
    const distPath = path.join(__dirname, 'dist');

    // Initialize git and commit
    execSync('git init', { cwd: distPath, stdio: 'inherit' });
    execSync('git add -A', { cwd: distPath, stdio: 'inherit' });
    execSync('git commit -m "Deploy to GitHub Pages"', { cwd: distPath, stdio: 'inherit' });

    // Push to gh-pages branch forcefully
    execSync(`git push -f ${repoUrl} HEAD:gh-pages`, { cwd: distPath, stdio: 'inherit' });

    console.log('Successfully deployed to GitHub Pages!');
} catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
}
