// js/app.js
import { parser } from './parser.js';
import { generateClass } from './generator.js';

// Global application state tracking what the user configures
const projectState = {
    globalSettings: {},
    subsystems: []
};

// 1. Tab Switching Logic
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active classes from all tabs and panels
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            // Add active class to the clicked tab
            tab.classList.add('active');
            
            // Find and show the target panel using the data-tab attribute
            const targetPanel = document.getElementById(tab.dataset.tab);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// 2. Dynamic Form Generator for Global Settings
function renderGlobalForm() {
    const formContainer = document.getElementById('global-form');
    const globalConfig = parser.configs.global; // Loaded from global.json

    if (!formContainer || !globalConfig) return;

    let htmlMarkup = '';

    for (const [key, field] of Object.entries(globalConfig)) {
        // Initialize our global state with the JSON defaults
        projectState.globalSettings[key] = field.default;

        htmlMarkup += `
        <div class="form-group">
            <label for="global-${key}"><strong>${field.name}</strong></label>
            <p class="field-desc">${field.description}</p>`;

        if (field.type === 'select') {
            htmlMarkup += `<select id="global-${key}" data-key="${key}">`;
            field.options.forEach(opt => {
                htmlMarkup += `<option value="${opt.value}" ${field.default === opt.value ? 'selected' : ''}>${opt.label}</option>`;
            });
            htmlMarkup += `</select>`;
        } else if (field.type === 'boolean') {
            const isChecked = field.default === 'true' || field.default === true ? 'checked' : '';
            htmlMarkup += `<input type="checkbox" id="global-${key}" data-key="${key}" ${isChecked}>`;
        } else if (field.type === 'int') {
            htmlMarkup += `<input type="number" id="global-${key}" data-key="${key}" value="${field.default}">`;
        } else {
            htmlMarkup += `<input type="text" id="global-${key}" data-key="${key}" value="${field.default}">`;
        }

        htmlMarkup += `</div>`;
    }

    formContainer.innerHTML = htmlMarkup;

    // Attach listeners so changes save live to projectState
    formContainer.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            projectState.globalSettings[key] = value;
            console.log("Updated Global Settings State:", projectState.globalSettings);
        });
    });
}

// Application startup routing
async function init() {
    // 1. Wait for all JSON configs to load completely
    await parser.loadAllConfigs();

    // 2. Activate UI interactions
    setupTabs();
    renderGlobalForm();

    // Temporary button listener for the Code Preview pane generation step
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            // Re-using the test mock block from earlier to print inside the preview tab
            const mockSubsystemState = {
                className: "ClawSubsystem",
                hardware: [
                    {
                        type: "Servo",
                        name: "pitchServo",
                        chosenConstructor: "basicConstructor",
                        parameters: { pwmPort: 2 }
                    }
                ]
            };
            const generatedJava = generateClass(mockSubsystemState);
            document.getElementById('output-preview').textContent = generatedJava;
        });
    }
}

// Fire up app when DOM elements are completely resolved
document.addEventListener('DOMContentLoaded', init);