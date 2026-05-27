import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Recursively sweep directories to find every downloaded JAR
function getAllJarsInDir(dir, jarList) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            getAllJarsInDir(fullPath, jarList);
        } else if (item.isFile() && item.name.endsWith('.jar') && !item.name.endsWith('-sources.jar') && !item.name.endsWith('-javadoc.jar')) {
            jarList.push(fullPath);
        }
    }
}

async function main() {
    console.log("🏁 Starting Universal Namespace Reflection Engine...");

    const robotProjectDir = path.join(process.cwd(), 'robot', 'testing');
    const vendordepsDir = path.join(robotProjectDir, 'vendordeps');
    const configsDir = path.join(process.cwd(), 'configs');
    const outputPath = path.join(configsDir, 'definitions.json');

    const masterDefinitions = {
        metadata: { generatedAt: new Date().toISOString(), apisProcessed: [] },
        classes: {}
    };

    console.log("🛠️ Compiling Reflector.java tool...");
    execSync('javac Reflector.java');

    const filters = [];

    // 1. Build Filters & Metadata exclusively from Vendordeps
    if (fs.existsSync(vendordepsDir)) {
        const files = fs.readdirSync(vendordepsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const depData = JSON.parse(fs.readFileSync(path.join(vendordepsDir, file), 'utf-8'));
                if (!depData.javaDependencies) continue;
                
                masterDefinitions.metadata.apisProcessed.push(depData.name);
                
                for (const javaDep of depData.javaDependencies) {
                    const rootPackage = javaDep.groupId.split('.').slice(0, 2).join('.');
                    if (!filters.includes(rootPackage)) {
                        filters.push(rootPackage);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ Failed to parse vendordep file: ${file}`, e.message);
            }
        }
    }

    // 2. Explicitly append WPILib to Filters and Metadata
    if (!filters.includes("edu.wpi.first")) {
        filters.push("edu.wpi.first");
    }
    masterDefinitions.metadata.apisProcessed.push("WPILib Suite Complete");

    // 3. Vacuum up ALL resolved JARs in the Gradle Cache
    // This ensures critical transitive dependencies like EJML (math) and Jackson (json) are present!
    const cacheRoot = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
    const jarPaths = [];
    console.log("🔍 Sweeping Gradle cache for resolved dependencies...");
    getAllJarsInDir(cacheRoot, jarPaths);

    if (jarPaths.length === 0) {
        console.error("❌ No cached dependency binaries were discovered in Gradle cache. Aborting execution.");
        return;
    }

    console.log(`📦 Discovered ${jarPaths.length} total JAR files to populate the ClassLoader.`);

    // 4. Flatten paths using the current OS path separator delimiter
    const pathDelimiter = os.platform() === 'win32' ? ';' : ':';
    const combinedJarClasspath = jarPaths.join(pathDelimiter);
    const combinedFilters = filters.join(',');

    console.log(`\n--------------------------------------------------`);
    console.log(`🧠 Executing Master Reflection Pass over classpaths...`);
    console.log(`🎯 Whitelisted Package Filters: ${filters.join(', ')}`);
    
    const tempJson = path.join(process.cwd(), 'temp_output.json');
    try {
        // 'stdio: inherit' ensures Java's fatal error logs print directly to the GitHub Actions console
        execSync(`java Reflector "${combinedJarClasspath}" "${tempJson}" "${combinedFilters}"`, { stdio: 'inherit' });

        if (fs.existsSync(tempJson)) {
            const schemaData = JSON.parse(fs.readFileSync(tempJson, 'utf-8'));
            Object.assign(masterDefinitions.classes, schemaData.classes);
            console.log(`   🎉 Successfully populated all classes!`);
        }
    } catch (err) {
        console.error(`   ❌ Reflection execution error:`, err.message);
    } finally {
        if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
    }

    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`\n🎉 Process complete! Definitions saved safely to: ${outputPath}`);
}

main();