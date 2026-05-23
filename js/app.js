import { ConfigParser } from './parser.js';
import { robotGenerator } from './generator.js';

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Initializing Robot Gen Engine...");

    // 1. Download and parse the entire FRC API completely client-side
    const apiData = await ConfigParser.loadAllConfigs();

    if (!apiData) {
        alert("Critical Error loading FRC Code references.");
        return;
    }

    // 2. Setup your dynamic tab/dropdown views using the freshly pulled definitions
    renderHardwareDropdowns();
    setupEventListeners();
});

function renderHardwareDropdowns() {
    // Dynamically retrieve all cached motor options from our parsed dataset
    const motorObjects = ConfigParser.getObjectsByCategory("motor");
    const selectEl = document.getElementById("motor-type-selector");
    
    if(!selectEl || motorObjects.length === 0) {
        // Fallback for demonstration if definitions.json isn't populated yet
        if(selectEl) {
            selectEl.innerHTML = `
                <option value="TalonFX" data-pkg="com.ctre.phoenix6.hardware">TalonFX (com.ctre)</option>
                <option value="CANSparkMax" data-pkg="com.revrobotics">CANSparkMax (com.rev)</option>
            `;
        }
        return;
    }

    selectEl.innerHTML = motorObjects.map(motor => 
        `<option value="${motor.name}" data-pkg="${motor.package}">${motor.name} (${motor.package})</option>`
    ).join('');
}

function setupEventListeners() {
    const generateBtn = document.getElementById("generate-btn");
    
    if (generateBtn) {
        generateBtn.addEventListener("click", () => {
            const selector = document.getElementById("motor-type-selector");
            const motorType = selector.value;
            const motorPkg = selector.selectedOptions[0].dataset.pkg;
            const limit = document.getElementById("current-limit").value;

            const isCTRE = motorPkg && motorPkg.includes("com.ctre");

            const hardwareConfig = {
                type: motorType,
                varName: "primaryMotor",
                portId: "1",
                limit: limit,
                isCTRE: isCTRE
            };

            robotGenerator.downloadProjectZip("DriveSubsystem", [hardwareConfig]);
        });
    }
}