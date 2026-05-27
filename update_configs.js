import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Traverses the hashed and nested Gradle cache directories to locate the true binary compiled .jar
 */
function findJarInGradleCache(groupId, artifactId, version) {
    const cacheRoot = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
    if (!fs.existsSync(cacheRoot)) return null;

    const groupDir = path.join(cacheRoot, groupId, artifactId, version);
    if (!fs.existsSync(groupDir)) return null;

    // Recurse through the unique hashes Gradle gives directories
    const items = fs.readdirSync(groupDir, { recursive: true });
    for (const item of items) {
        if (item.endsWith('.jar') && !item.endsWith('-sources.jar') && !item.endsWith('-javadoc.jar')) {
            return path.join(groupDir, item);
        }
    }
    return null;
}

async function main() {
    console.log("🏁 Starting Super-Charged Local Gradle Reflection Engine...");

    // Pointed explicitly to your nested robot project structure
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

    const tasks = [];

    // 1. Process all third-party vendordeps out of robot/testing/vendordeps
    if (fs.existsSync(vendordepsDir)) {
        const files = fs.readdirSync(vendordepsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const depData = JSON.parse(fs.readFileSync(path.join(vendordepsDir, file), 'utf-8'));
                const javaDep = depData.javaDependencies?.[0];
                if (!javaDep) continue;

                const localJarPath = findJarInGradleCache(javaDep.groupId, javaDep.artifactId, javaDep.version);
                if (localJarPath) {
                    tasks.push({
                        name: depData.name,
                        jarPath: localJarPath,
                        filter: javaDep.groupId.split('.').slice(0, 3).join('.')
                    });
                } else {
                    console.warn(`⚠️ Could not find cached binary for ${depData.name} in Gradle cache.`);
                }
            } catch (e) {
                console.warn(`⚠️ Failed to map vendordep entry: ${file}`, e.message);
            }
        }
    } else {
        console.error(`❌ Error: Vendordeps folder not found at: ${vendordepsDir}`);
    }

    // 2. Discover WPILib core jar dynamically by scanning the cache root
    const wpiCacheBase = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'edu.wpi.first.wpilibj', 'wpilibj-java');
    if (fs.existsSync(wpiCacheBase)) {
        const versions = fs.readdirSync(wpiCacheBase);
        if (versions.length > 0) {
            // Grab the first available version matching what your project fetched
            const wpiVersion = versions[0];
            const wpiJar = findJarInGradleCache('edu.wpi.first.wpilibj', 'wpilibj-java', wpiVersion);
            if (wpiJar) {
                tasks.push({
                    name: "WPILib",
                    jarPath: wpiJar,
                    filter: "edu.wpi.first.wpilibj"
                });
            }
        }
    } else {
        console.warn("⚠️ Warning: WPILib directory cache targets not discovered yet. Run gradlew compilation first.");
    }

    // 3. Reflect all discovered local binaries
    for (const task of tasks) {
        console.log(`\n--------------------------------------------------`);
        console.log(`🧠 Inspecting Local Cache Artifact: ${task.name}`);
        
        const tempJson = path.join(process.cwd(), 'temp_output.json');
        try {
            execSync(`java Reflector "${task.jarPath}" "${tempJson}" "${task.filter}"`);

            if (fs.existsSync(tempJson)) {
                const schemaData = JSON.parse(fs.readFileSync(tempJson, 'utf-8'));
                Object.assign(masterDefinitions.classes, schemaData.classes);
                masterDefinitions.metadata.apisProcessed.push(task.name);
                console.log(`   🎉 Successfully updated definitions for "${task.name}".`);
            }
        } catch (err) {
            console.error(`   ❌ Reflection failed for ${task.name}:`, err.message);
        } finally {
            if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
        }
    }

    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`\n🎉 Process complete! Production configuration saved to: ${outputPath}`);
}

main();