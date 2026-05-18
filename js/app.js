import { parser } from './parser.js';
import { generateSubsystemCode } from './generator.js';

const mockSubsystemState = {
    className: "ClawSubsystem",
    hardware: [
        {
            type: "Servo",
            name: "pitchServo",
            chosenConstructor: "basicConstructor",
            parameters: {
                pwmPort: 2
            }
        }
    ]
};

async function init() {
    await parser.loadAllConfigs();

    const generateBtn = document.getElementById('generate-btn');
    const outputPreview = document.getElementById('output-preview');

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const generatedJava = generateSubsystemCode(mockSubsystemState);
            
            outputPreview.textContent = generatedJava;
        });
    }
}

document.addEventListener('DOMContentLoaded', init);