import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';

async function downloadFile(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}`);
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
}

async function main() {
    console.log("🏁 Starting Reflection-Based Code Sync...");

    const configsDir = path.join(process.cwd(), 'configs');
    const sourcesPath = path.join(configsDir, 'sources.json');
    const outputPath = path.join(configsDir, 'definitions.json');

    const { sources } = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
    const masterDefinitions = {
        metadata: { generatedAt: new Date().toISOString(), apisProcessed: [] },
        classes: {}
    };

    // Compile the local java tool instantly
    console.log("🛠️ Compiling Reflector.java tool...");
    execSync('javac Reflector.java');

    for (const source of sources) {
        console.log(`\n📥 Downloading JAR library for: ${source.name}`);
        const tempJar = path.join(process.cwd(), 'temp_target.jar');
        const tempJson = path.join(process.cwd(), 'temp_output.json');

        try {
            await downloadFile(source.jarUrl, tempJar);

            console.log(`🧠 Executing reflection analysis on binary artifacts...`);
            // Run the Reflector tool: java Reflector <jar> <out> [filter]
            execSync(`java Reflector "${tempJar}" "${tempJson}" "${source.filter || ''}"`);

            if (fs.existsSync(tempJson)) {
                const schemaData = JSON.parse(fs.readFileSync(tempJson, 'utf-8'));
                Object.assign(masterDefinitions.classes, schemaData.classes);
                masterDefinitions.metadata.apisProcessed.push(source.name);
            }

        } catch (err) {
            console.error(`❌ pipeline failure for ${source.name}:`, err.message);
        } finally {
            // Clean up temporary workspace run files
            if (fs.existsSync(tempJar)) fs.unlinkSync(tempJar);
            if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
        }
    }

    // Output final product
    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2));
    console.log(`\n🎉 Process complete! Production configuration saved to: ${outputPath}`);
}

main();