import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';

// Helper to download files securely using standard browser headers
async function downloadFile(url, dest) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!res.ok) throw new Error(`Server returned status ${res.status}: Failed to download ${url}`);
    
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
}

async function main() {
    console.log("🏁 Starting Dynamic VendorDep Reflection Engine...");

    const vendordepsDir = path.join(process.cwd(), 'robot', 'testing', 'vendordeps');
    const configsDir = path.join(process.cwd(), 'configs');
    const outputPath = path.join(configsDir, 'definitions.json');

    const masterDefinitions = {
        metadata: { generatedAt: new Date().toISOString(), apisProcessed: [] },
        classes: {}
    };

    console.log("🛠️ Compiling Reflector.java tool...");
    execSync('javac Reflector.java');

    // 1. Gather all targets from the vendordeps folder dynamically
    const tasks = [];

    if (fs.existsSync(vendordepsDir)) {
        const files = fs.readdirSync(vendordepsDir).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            try {
                const depData = JSON.parse(fs.readFileSync(path.join(vendordepsDir, file), 'utf-8'));
                const javaDep = depData.javaDependencies?.[0];
                
                if (!javaDep) continue;

                // Normalize Maven root url structure
                let mavenRoot = depData.mavenUrls?.[0];
                if (!mavenRoot.endsWith('/')) mavenRoot += '/';
                
                // Add "release/" subdirectory if not explicitly present in vendor URL string
                if (!mavenRoot.includes('/release/')) {
                    mavenRoot += 'release/';
                }

                const groupPath = javaDep.groupId.replace(/\./g, '/');
                const artifactId = javaDep.artifactId;
                const version = javaDep.version;

                // Construct standard Maven artifact path
                const jarUrl = `${mavenRoot}${groupPath}/${artifactId}/${version}/${artifactId}-${version}.jar`;

                tasks.push({
                    name: depData.name,
                    jarUrl: jarUrl,
                    filter: javaDep.groupId.split('.').slice(0, 3).join('.') // e.g., "com.revrobotics" or "com.ctre"
                });
            } catch (e) {
                console.warn(`⚠️ Failed to parse vendordep file: ${file}`, e.message);
            }
        }
    }

    // 2. Add WPILib as a hardcoded task since it isn't a traditional standalone vendordep
    tasks.push({
        name: "WPILib",
        jarUrl: "https://frcmaven.wpi.edu/artifactory/release/edu/wpi/first/wpilibj/wpilibj-java/2026.1.1/wpilibj-java-2026.1.1.jar",
        filter: "edu.wpi.first.wpilibj"
    });

    // 3. Process every gathered target
    for (const task of tasks) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📥 Processing: ${task.name}`);
        console.log(`🔗 Target URL: ${task.jarUrl}`);
        
        const tempJar = path.join(process.cwd(), 'temp_target.jar');
        const tempJson = path.join(process.cwd(), 'temp_output.json');

        try {
            await downloadFile(task.jarUrl, tempJar);
            console.log(`🧠 Reflecting compiled byte data structure definitions...`);
            
            execSync(`java Reflector "${tempJar}" "${tempJson}" "${task.filter}"`);

            if (fs.existsSync(tempJson)) {
                const schemaData = JSON.parse(fs.readFileSync(tempJson, 'utf-8'));
                Object.assign(masterDefinitions.classes, schemaData.classes);
                masterDefinitions.metadata.apisProcessed.push(task.name);
                console.log(`   🎉 Successfully updated definitions for "${task.name}".`);
            }

        } catch (err) {
            console.error(`   ❌ Pipeline failure for ${task.name}:`, err.message);
        } finally {
            if (fs.existsSync(tempJar)) fs.unlinkSync(tempJar);
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