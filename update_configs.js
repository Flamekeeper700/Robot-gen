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

    // 2. Add ALL WPILib Core Namespaces (Math, Util, HAL, NTCore, etc.)
    const cacheRoot = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
    if (fs.existsSync(cacheRoot)) {
        // Find any cached dependency groups that belong to the WPILib ecosystem
        const groups = fs.readdirSync(cacheRoot).filter(g => g.startsWith('edu.wpi.first.'));
        
        for (const group of groups) {
            const groupDir = path.join(cacheRoot, group);
            const artifacts = fs.readdirSync(groupDir);
            
            for (const artifact of artifacts) {
                // FRC libraries end in '-java'. We want to skip JNI/C++ headers to avoid cluttering the ClassLoader
                if (artifact.endsWith('-java')) {
                    const versions = fs.readdirSync(path.join(groupDir, artifact));
                    if (versions.length > 0) {
                        const version = versions[0];
                        const wpiJar = findJarInGradleCache(group, artifact, version);
                        if (wpiJar) {
                            jarPaths.push(wpiJar);
                            if (!filters.includes("edu.wpi.first")) {
                                filters.push("edu.wpi.first");
                                masterDefinitions.metadata.apisProcessed.push("WPILib Suite Complete");
                            }
                        }
                    }
                }
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