import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

function findJarInGradleCache(groupId, artifactId, version) {
    const cacheRoot = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
    if (!fs.existsSync(cacheRoot)) return null;

    const groupDir = path.join(cacheRoot, groupId, artifactId, version);
    if (!fs.existsSync(groupDir)) return null;

    const items = fs.readdirSync(groupDir, { recursive: true });
    for (const item of items) {
        if (item.endsWith('.jar') && !item.endsWith('-sources.jar') && !item.endsWith('-javadoc.jar')) {
            return path.join(groupDir, item);
        }
    }
    return null;
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

    const jarPaths = [];
    const filters = [];

    // 1. Gather all third-party libraries out of vendordeps
    if (fs.existsSync(vendordepsDir)) {
        const files = fs.readdirSync(vendordepsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const depData = JSON.parse(fs.readFileSync(path.join(vendordepsDir, file), 'utf-8'));
                if (!depData.javaDependencies) continue;
                
                let processedAny = false;
                for (const javaDep of depData.javaDependencies) {
                    const localJarPath = findJarInGradleCache(javaDep.groupId, javaDep.artifactId, javaDep.version);
                    if (localJarPath) {
                        jarPaths.push(localJarPath);
                        
                        // FIXED: Grab only the root organizational namespace (e.g. "com.revrobotics" or "org.littletonrobotics")
                        // by slicing the first two segments. This prevents trailing artifact IDs from filtering out sub-packages.
                        const rootPackage = javaDep.groupId.split('.').slice(0, 2).join('.');
                        if (!filters.includes(rootPackage)) {
                            filters.push(rootPackage);
                        }
                        processedAny = true;
                    }
                }
                
                if (processedAny) {
                    masterDefinitions.metadata.apisProcessed.push(depData.name);
                }
            } catch (e) {
                console.warn(`⚠️ Failed to parse vendordep file: ${file}`, e.message);
            }
        }
    }

    // 2. Add WPILib Core Namespace
    const wpiCacheBase = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'edu.wpi.first.wpilibj', 'wpilibj-java');
    if (fs.existsSync(wpiCacheBase)) {
        const versions = fs.readdirSync(wpiCacheBase);
        if (versions.length > 0) {
            const wpiVersion = versions[0];
            const wpiJar = findJarInGradleCache('edu.wpi.first.wpilibj', 'wpilibj-java', wpiVersion);
            if (wpiJar) {
                jarPaths.push(wpiJar);
                filters.push("edu.wpi.first"); // Captures edu.wpi.first.wpilibj, edu.wpi.first.hal, etc.
                masterDefinitions.metadata.apisProcessed.push("WPILib");
            }
        }
    }

    if (jarPaths.length === 0) {
        console.error("❌ No cached vendor dependency binaries were discovered. Aborting execution.");
        return;
    }

    // 3. Flatten paths using the current OS path separator delimiter
    const pathDelimiter = os.platform() === 'win32' ? ';' : ':';
    const combinedJarClasspath = jarPaths.join(pathDelimiter);
    const combinedFilters = filters.join(',');

    console.log(`\n--------------------------------------------------`);
    console.log(`🧠 Executing Master Reflection Pass over ${jarPaths.length} libraries...`);
    console.log(`🔍 Whitelisted Package Filters: ${filters.join(', ')}`);
    
    const tempJson = path.join(process.cwd(), 'temp_output.json');
    try {
        execSync(`java Reflector "${combinedJarClasspath}" "${tempJson}" "${combinedFilters}"`);

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