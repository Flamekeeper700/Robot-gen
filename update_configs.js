import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
    console.log("🏁 Starting Universal Namespace Reflection Engine...");

    const robotProjectDir = path.join(process.cwd(), 'robot', 'testing');
    const vendordepsDir = path.join(robotProjectDir, 'vendordeps');
    const configsDir = path.join(process.cwd(), 'configs');
    const outputPath = path.join(configsDir, 'definitions.json');

    const filters = ["edu.wpi.first"]; // Always include WPILib

    // 1. Parse vendordeps just to get the base package filters
    if (fs.existsSync(vendordepsDir)) {
        const files = fs.readdirSync(vendordepsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const depData = JSON.parse(fs.readFileSync(path.join(vendordepsDir, file), 'utf-8'));
                if (!depData.javaDependencies) continue;
                
                for (const javaDep of depData.javaDependencies) {
                    const rootPackage = javaDep.groupId.split('.').slice(0, 2).join('.');
                    if (!filters.includes(rootPackage)) {
                        filters.push(rootPackage);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ Failed to parse vendordep file: ${file}`);
            }
        }
    }

    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    const combinedFilters = filters.join(',');
    
    // We use a custom delimiter (::) to safely pass paths and comma-separated lists to Gradle
    const gradleArgs = `../../configs/definitions.json::${combinedFilters}`;

    console.log(`\n--------------------------------------------------`);
    console.log(`🚀 Dispatching execution to Gradle (Robot-gen)...`);
    console.log(`🎯 Whitelisted Packages: ${combinedFilters}`);
    
    try {
        // Execute the custom Gradle task from the root directory
        execSync(`./gradlew runReflector -PreflectorArgs="${gradleArgs}"`, { 
            cwd: robotProjectDir, 
            stdio: 'inherit' 
        });
        
    } catch (err) {
        console.error(`❌ Reflection execution failed. Check Gradle logs above.`);
    }
}

main();