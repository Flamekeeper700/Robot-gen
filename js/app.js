// js/app.js
import { parser } from './parser.js';
import { generateClass } from './generator.js';

/**
 * Global application state tracking everything configured by the user.
 * Built to map directly against your configuration engine structures.
 */
const projectState = {
    globalSettings: {},
    subsystems: []
};

/**
 * Generates a standard random unique ID to reliably track rows and components
 * in memory without relying on DOM array indexing positions.
 */
function generateUID() {
    return 'uid_' + Math.random().toString(36).substring(2, 11);
}

/**
 * Handles tab-switching navigation across the workspace layout panels.
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Drop current active class associations
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            // Assign active target hooks to clicked selection
            tab.classList.add('active');
            const targetPanel = document.getElementById(tab.dataset.tab);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

/**
 * Dynamically loops through global.json configurations, spawns matching HTML 
 * inputs, handles fallback defaults, and listens live to update state values.
 */
function renderGlobalForm() {
    const formContainer = document.getElementById('global-form');
    const globalConfig = parser.configs.global;

    if (!formContainer || !globalConfig) return;

    let htmlMarkup = '';

    for (const [key, field] of Object.entries(globalConfig)) {
        // Cache current running state value or establish the JSON default value
        if (projectState.globalSettings[key] === undefined) {
            projectState.globalSettings[key] = field.default;
        }

        htmlMarkup += `
        <div class="form-group">
            <label for="global-${key}"><strong>${field.name}</strong></label>
            <p class="field-desc">${field.description}</p>`;

        if (field.type === 'select') {
            htmlMarkup += `<select id="global-${key}" data-key="${key}">`;
            field.options.forEach(opt => {
                const isSelected = projectState.globalSettings[key] === opt.value ? 'selected' : '';
                htmlMarkup += `<option value="${opt.value}" ${isSelected}>${opt.label}</option>`;
            });
            htmlMarkup += `</select>`;
        } else if (field.type === 'boolean') {
            const isChecked = (projectState.globalSettings[key] === 'true' || projectState.globalSettings[key] === true) ? 'checked' : '';
            htmlMarkup += `<input type="checkbox" id="global-${key}" data-key="${key}" ${isChecked}>`;
        } else if (field.type === 'int') {
            htmlMarkup += `<input type="number" id="global-${key}" data-key="${key}" value="${projectState.globalSettings[key]}">`;
        } else {
            htmlMarkup += `<input type="text" id="global-${key}" data-key="${key}" value="${projectState.globalSettings[key]}">`;
        }

        htmlMarkup += `</div>`;
    }

    formContainer.innerHTML = htmlMarkup;

    // Attach listeners to update globalSettings live on change
    formContainer.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            projectState.globalSettings[key] = value;
            console.log("Updated Global Settings State:", projectState.globalSettings);
        });
    });
}

/**
 * Injects a new blank Subsystem object schema array container into state management.
 */
function addSubsystem() {
    const subsystemId = generateUID();
    
    const newSubsystem = {
        id: subsystemId,
        className: "UnnamedSubsystem",
        hardware: []
    };

    projectState.subsystems.push(newSubsystem);
    renderSubsystems();
}

/**
 * Extracts object configuration footprints from objects.json to bind custom,
 * parametric hardware device modules into a specific Subsystem entity.
 */
function addHardwareToSubsystem(subsystemId, type) {
    const subsystem = projectState.subsystems.find(s => s.id === subsystemId);
    if (!subsystem) return;

    const typeDef = parser.configs.objects[type];
    if (!typeDef) return;

    // Default to the first available constructor signature block defined in your JSON
    const chosenConstructorDef = typeDef.constructors[0];
    
    // Dynamically compile parameters based on constructor requirements
    const defaultParams = {};
    if (chosenConstructorDef && chosenConstructorDef.parameters) {
        chosenConstructorDef.parameters.forEach(p => {
            defaultParams[p.name] = p.default;
        });
    }

    subsystem.hardware.push({
        id: generateUID(),
        type: type,
        name: type.toLowerCase() + (subsystem.hardware.length + 1),
        chosenConstructor: chosenConstructorDef ? chosenConstructorDef.name : "",
        parameters: defaultParams
    });

    renderSubsystems();
}

/**
 * Builds and handles lifecycle state synchronization for the Subsystems builder window.
 */
function renderSubsystems() {
    const container = document.getElementById('subsystems-container');
    if (!container) return;

    container.innerHTML = '';

    projectState.subsystems.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subsystem-card';
        card.dataset.id = sub.id;

        // Build selection elements directly out of key tags parsed inside objects.json
        let hardwareOptions = '<option value="" selected disabled>-- Add Device --</option>';
        for (const key of Object.keys(parser.configs.objects)) {
            hardwareOptions += `<option value="${key}">${key}</option>`;
        }

        card.innerHTML = `
            <div class="subsystem-header">
                <input type="text" class="subsystem-name-input" value="${sub.className}" placeholder="SubsystemClassName">
                <button class="btn-delete delete-subsystem-btn">Delete Subsystem</button>
            </div>
            <div class="hardware-controls">
                <select class="add-hardware-select">${hardwareOptions}</select>
            </div>
            <div class="hardware-list"></div>
        `;

        // Input validation handler mapping to your global package configurations
        const nameInput = card.querySelector('.subsystem-name-input');
        nameInput.addEventListener('input', (e) => {
            sub.className = e.target.value.replace(/\s+/g, ''); // Enforce valid Java class naming rules
        });

        // Subsystem card clear loop
        card.querySelector('.delete-subsystem-btn').addEventListener('click', () => {
            projectState.subsystems = projectState.subsystems.filter(s => s.id !== sub.id);
            renderSubsystems();
        });

        // Add Hardware trigger observer
        const addHardwareSelect = card.querySelector('.add-hardware-select');
        addHardwareSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                addHardwareToSubsystem(sub.id, e.target.value);
            }
        });

        // Recurse and build individual hardware parameter configuration inputs dynamically
        const listContainer = card.querySelector('.hardware-list');
        sub.hardware.forEach(hw => {
            const hwRow = document.createElement('div');
            hwRow.className = 'hardware-row';
            
            // Look up the device template specifications from objects.json
            const typeDef = parser.configs.objects[hw.type];
            const constructorDef = typeDef ? typeDef.constructors.find(c => c.name === hw.chosenConstructor) : null;

            let parametersHTML = '';

            // Render form fields matching every parameter expected by this object's constructor
            if (constructorDef && constructorDef.parameters) {
                constructorDef.parameters.forEach(p => {
                    const currentVal = hw.parameters[p.name] !== undefined ? hw.parameters[p.name] : p.default;
                    
                    // Determine HTML input type based on the JSON configuration's type definition
                    let inputTypeMarkup = '';
                    if (p.type === 'int' || p.type === 'double') {
                        inputTypeMarkup = `<input type="number" class="hw-param-input" data-param-key="${p.name}" value="${currentVal}">`;
                    } else if (p.type === 'boolean') {
                        const isChecked = currentVal === true || currentVal === 'true' ? 'checked' : '';
                        inputTypeMarkup = `<input type="checkbox" class="hw-param-input" data-param-key="${p.name}" ${isChecked}>`;
                    } else {
                        // Safe fallback default to standard alphanumeric text inputs for "string" type
                        inputTypeMarkup = `<input type="text" class="hw-param-input" data-param-key="${p.name}" value="${currentVal}">`;
                    }

                    parametersHTML += `
                        <div>
                            <label><strong>${p.name}</strong></label><br>
                            ${inputTypeMarkup}
                        </div>
                    `;
                });
            } else {
                // Hard fallback handling for generic cases
                const firstParamKey = Object.keys(hw.parameters)[0] || 'pwmPort';
                parametersHTML += `
                    <div>
                        <label><strong>${firstParamKey}</strong></label><br>
                        <input type="number" class="hw-param-input" data-param-key="${firstParamKey}" value="${hw.parameters[firstParamKey]}">
                    </div>
                `;
            }

            hwRow.innerHTML = `
                <div>
                    <label><strong>Variable Name</strong></label><br>
                    <input type="text" class="hw-name-input" value="${hw.name}">
                </div>
                ${parametersHTML}
                <button class="btn-delete delete-hw-btn">X</button>
            `;

            // Keep hardware reference variable names synchronized live
            hwRow.querySelector('.hw-name-input').addEventListener('input', (e) => {
                hw.name = e.target.value.replace(/\s+/g, '');
            });

            // Loop and hook change observers onto all hardware parameters mapped inside this item row
            hwRow.querySelectorAll('.hw-param-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const targetKey = e.target.dataset.paramKey;
                    let typedValue = e.target.value;

                    // Re-parse data mutations safely back into state based on input context
                    if (e.target.type === 'checkbox') {
                        typedValue = e.target.checked;
                    } else if (e.target.type === 'number') {
                        typedValue = typedValue.includes('.') ? parseFloat(typedValue) : parseInt(typedValue);
                        if (isNaN(typedValue)) typedValue = 0;
                    }

                    hw.parameters[targetKey] = typedValue;
                    console.log(`Updated Hardware Param [${targetKey}]:`, hw.parameters);
                });
            });

            // Hardware row layout clear hook
            hwRow.querySelector('.delete-hw-btn').addEventListener('click', () => {
                sub.hardware = sub.hardware.filter(h => h.id !== hw.id);
                renderSubsystems();
            });

            listContainer.appendChild(hwRow);
        });

        container.appendChild(card);
    });
}

/**
 * Orchestrates configuration parsing, UI assembly binding loops, 
 * and operational rendering actions.
 */
async function init() {
    // 1. Await configuration resolution maps asynchronously
    await parser.loadAllConfigs();

    // 2. Initialize interactive view layouts
    setupTabs();
    renderGlobalForm();
    renderSubsystems();

    // 3. Connect button interaction mappings
    const addSubsystemBtn = document.getElementById('add-subsystem-btn');
    if (addSubsystemBtn) {
        addSubsystemBtn.addEventListener('click', addSubsystem);
    }

    // 4. Attach layout compiler link to Code Preview tracking interface
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const previewCodeWindow = document.getElementById('output-preview');
            if (!previewCodeWindow) return;

            if (projectState.subsystems.length === 0) {
                previewCodeWindow.textContent = "// No subsystems created yet! Go to the Subsystems tab to create one.";
                return;
            }

            // Preview compilation based on the first operational panel layout config row
            const activePreviewTarget = projectState.subsystems[0];
            
            // Call your newly renamed code generation layout pipeline helper 
            const compiledJavaOutput = generateClass(activePreviewTarget);
            previewCodeWindow.textContent = compiledJavaOutput;
        });
    }
}

// Bind initialization chain execution to standard content ready triggers
document.addEventListener('DOMContentLoaded', init);