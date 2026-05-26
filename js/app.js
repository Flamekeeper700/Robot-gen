import { Generator } from './generator.js';

let tabCount = 1;

document.addEventListener("DOMContentLoaded", () => {
    // Tab switching logic
    document.getElementById('subsystem-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn') && !e.target.classList.contains('add-btn')) {
            // Deactivate all
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Activate clicked
            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        }
    });

    // Add new tab logic
    document.getElementById('add-subsystem-btn').addEventListener('click', () => {
        const tabsContainer = document.getElementById('subsystem-tabs');
        const contentsContainer = document.getElementById('tab-contents');
        
        const newTabBtn = document.createElement('button');
        newTabBtn.className = 'tab-btn';
        newTabBtn.setAttribute('data-target', `tab-${tabCount}`);
        newTabBtn.innerText = `Subsystem ${tabCount + 1}`;
        tabsContainer.insertBefore(newTabBtn, document.getElementById('add-subsystem-btn'));

        const newContent = document.getElementById('tab-0').cloneNode(true);
        newContent.id = `tab-${tabCount}`;
        newContent.classList.remove('active');
        
        // Reset inputs in cloned tab
        newContent.querySelector('.class-name-input').value = `Subsystem${tabCount + 1}`;
        contentsContainer.appendChild(newContent);
        
        tabCount++;
    });

    // Project Generation Trigger
    document.getElementById('generate-btn').addEventListener('click', async () => {
        const framework = document.getElementById('framework-selector').value;
        const subsystemConfigs = [];
        
        document.querySelectorAll('.tab-content').forEach(tab => {
            subsystemConfigs.push({
                className: tab.querySelector('.class-name-input').value,
                hardware: tab.querySelector('.api-type-selector').value,
                limit: tab.querySelector('.current-limit').value
            });
        });

        // Initialize generator (Parser outputs would be passed here)
        const gen = new Generator({}, {
            classTemplate: [
                "package ${package};",
                "",
                "${imports}",
                "",
                "public class ${className} {",
                "    // Generated Fields",
                "    ${fields}",
                "",
                "    public ${className}() {",
                "        // Initialization",
                "        ${initialization}",
                "    }",
                "",
                "    // Generated Methods",
                "    ${methods}",
                "}"
            ]
        }, {});
        
        await gen.generateProjectZip(subsystemConfigs, framework);
    });
});