import { buildProjectZip, getSubsystemContext } from './generator.js';
import { subsystemTemplate, ioInterfaceTemplate, ioRealTemplate, ioSimTemplate, commandTemplate } from './templates.js';

// Configuration schemas loaded fallback safely to bypass local CORS environment blocks
let methodsConfig = {
    "setPercentOutput": {
        "displayName": "Open-Loop Duty Cycle (setPercentOutput)",
        "parameters": [
            { "name": "percent", "type": "double", "default": "0.0" }
        ],
        "subsystemTemplate": [
            "    /** Set open-loop output. */",
            "    public void setPercentOutput(double percent) {",
            "        {{#if isTalonFX}}m_leader.set(percent);{{else}}m_leader.set(percent);{{/if}}",
            "    }"
        ],
        "commandExecute": "m_subsystem.setPercentOutput(m_percent);"
    },
    "setClosedLoopTarget": {
        "displayName": "Closed-Loop Reference Target (setClosedLoopTarget)",
        "parameters": [
            { "name": "target", "type": "double", "default": "0.0" }
        ],
        "subsystemTemplate": [
            "    /** Set closed-loop target. */",
            "    public void setClosedLoopTarget(double target) {",
            "        {{#if isTalonFX}}m_leader.setControl(new com.ctre.phoenix6.controls.DutyCycleOut(target));{{else}}m_leader.getClosedLoopController().setReference(target, com.revrobotics.spark.SparkBase.ControlType.kVelocity);{{/if}}",
            "    }"
        ],
        "commandExecute": "m_subsystem.setClosedLoopTarget(m_target);"
    },
    "zeroSensor": {
        "displayName": "Sensor Synchronization (zeroSensor)",
        "parameters": [],
        "subsystemTemplate": [
            "    /** Zero primary sensor. */",
            "    public void zeroSensor() {",
            "        {{#if isTalonFX}}m_leader.setPosition(0.0);{{else}}m_leader.getEncoder().setPosition(0.0);{{/if}}",
            "    }"
        ],
        "commandExecute": "m_subsystem.zeroSensor();",
        "commandIsFinished": "return true;"
    }
};

let mechanismsConfig = {
    "direct": {
        "name": "Open-loop duty cycle (Percent output)",
        "defaultMethods": ["setPercentOutput", "zeroSensor"]
    },
    "flywheel": {
        "name": "Flywheel (Velocity closed-loop + FF)",
        "defaultMethods": ["setPercentOutput", "setClosedLoopTarget"]
    },
    "elevator": {
        "name": "Elevator (Position closed-loop + kG)",
        "defaultMethods": ["setPercentOutput", "setClosedLoopTarget", "zeroSensor"]
    },
    "arm": {
        "name": "Single-jointed arm (Position closed-loop + cosine kG)",
        "defaultMethods": ["setPercentOutput", "setClosedLoopTarget", "zeroSensor"]
    }
};

let robotState = {
    general: { team: "9999", logging: "advantagekit" },
    subsystems: [],
    commands: []
};

let activePreviewTabs = {};
let activeSubsystemIndex = 0;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active-tab'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(`btn-${tabId}`).classList.add('active-tab');
    
    if (tabId === 'tab-subsystems') renderSubsystems();
    if (tabId === 'tab-commands') renderCommands();
}

function saveState() {
    robotState.general.team = document.getElementById('cfg-team').value;
    robotState.general.logging = document.getElementById('cfg-logging').value;
    localStorage.setItem('robogen_state', JSON.stringify(robotState));
    updateAllPreviews(); 
}

function updateAllPreviews() {
    robotState.subsystems.forEach((sub, idx) => {
        if (!sub.name || !sub.type) return;
        renderCodePreviewText(idx);
    });
    robotState.commands.forEach((cmd, idx) => {
        renderCommandPreviewText(idx);
    });
}

function highlightJavaSyntax(rawCode) {
    if (!rawCode) return "";
    let html = rawCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const tokens = [
        { regex: /(\/\/.*)/g, clazz: 'j-comment' },
        { regex: /("@\w+)/g, clazz: 'j-annotation' },
        { regex: /\b(package|import|public|class|interface|extends|implements|private|final|this|new|double|int|boolean|void|return|static|default)\b/g, clazz: 'j-keyword' },
        { regex: /\b(true|false|null)\b/g, clazz: 'j-boolean' },
        { regex: /("(?:\\"|[^"])*")/g, clazz: 'j-string' },
        { regex: /\b(\d+(?:\.\d+)?)\b/g, clazz: 'j-number' },
        { regex: /\b(SubsystemBase|Command|TalonFX|SparkMax|SparkFlex|SparkBase|VelocityVoltage|PositionVoltage|VoltageOut|ElevatorFeedforward|ArmFeedforward|DCMotorSim|DCMotor|Logger|DogLog|Math|String)\b/g, clazz: 'j-type' }
    ];

    let placeholders = [];
    tokens.forEach((token, index) => {
        html = html.replace(token.regex, (match) => {
            const id = `___TOKEN_${index}_${placeholders.length}___`;
            placeholders.push({ id: id, html: `<span class="${token.clazz}">${match}</span>` });
            return id;
        });
    });

    placeholders.reverse().forEach(placeholder => {
        html = html.replace(placeholder.id, placeholder.html);
    });
    return html;
}

function renderCodePreviewText(idx) {
    const sub = robotState.subsystems[idx];
    const previewContainer = document.getElementById(`preview-code-${idx}`);
    if (!previewContainer) return;

    const followerIds = (sub.config?.followers || []).map(f => f.id);
    const ctx = getSubsystemContext(sub, robotState.general.logging, sub.config.leaderId || 10, followerIds, methodsConfig, mechanismsConfig);
    const activeSubTab = activePreviewTabs[idx] || "subsystem";

    let targetCode = subsystemTemplate;
    if (robotState.general.logging === "advantagekit" || robotState.general.logging === "doglog") {
        if (activeSubTab === "interface") targetCode = ioInterfaceTemplate;
        if (activeSubTab === "real") targetCode = ioRealTemplate;
        if (activeSubTab === "sim") targetCode = ioSimTemplate;
    }

    previewContainer.innerHTML = highlightJavaSyntax(Handlebars.compile(targetCode)(ctx));
}

function renderSubsystems() {
    const container = document.getElementById('subsystems-container');
    container.innerHTML = '';
    
    if (activeSubsystemIndex >= robotState.subsystems.length) {
        activeSubsystemIndex = Math.max(0, robotState.subsystems.length - 1);
    }

    const splitWrapper = document.createElement('div');
    splitWrapper.className = 'subsystem-split-container';

    const sidebar = document.createElement('div');
    sidebar.className = 'subsystem-sidebar';

    robotState.subsystems.forEach((sub, idx) => {
        const navBtn = document.createElement('button');
        navBtn.className = `sub-nav-item ${idx === activeSubsystemIndex ? 'active-sub-nav' : ''}`;
        navBtn.dataset.subnavidx = idx;
        navBtn.textContent = sub.name || `Subsystem [${idx + 1}]`;
        sidebar.appendChild(navBtn);
    });

    const viewport = document.createElement('div');
    viewport.className = 'subsystem-viewport';

    if (robotState.subsystems.length === 0) {
        viewport.innerHTML = `<p style="color:#555; text-align:center; font-family:monospace; margin-top:40px;">No active subsystems configured. Click "Initialize Subsystem" above to begin creating tracking modules.</p>`;
        splitWrapper.appendChild(viewport);
        container.appendChild(splitWrapper);
        return;
    }

    const sub = robotState.subsystems[activeSubsystemIndex];
    const idx = activeSubsystemIndex;

    const div = document.createElement('div');
    div.className = 'subsystem-card';
    
    const typeOptions = [
        { id: 'direct', name: 'Open-loop duty cycle (Percent output)' },
        { id: 'flywheel', name: 'Flywheel (Velocity closed-loop + FF)' },
        { id: 'elevator', name: 'Elevator (Position closed-loop + kG)' },
        { id: 'arm', name: 'Single-jointed arm (Position closed-loop + cosine kG)' }
    ];

    const typeSelectHtml = typeOptions.map(opt => 
        `<option value="${opt.id}" ${sub.type === opt.id ? 'selected' : ''}>${opt.name}</option>`
    ).join('');

    let html = `
        <div class="card-header">
            <span>Configuration: ${sub.name || 'UnconfiguredSubsystem'}</span>
            <button class="btn-danger" data-idx="${idx}" action="del-sub">Delete subsystem</button>
        </div>
        <div class="card-body">
            <div class="grid-layout">
                <div>
                    <label>Subsystem class name</label>
                    <input type="text" value="${sub.name || ''}" placeholder="e.g. Intake" class="val-sub-name" data-idx="${idx}">
                </div>
                <div>
                    <label>Control / mechanism profile</label>
                    <select class="val-sub-type" data-idx="${idx}">
                        <option value="" disabled ${!sub.type ? 'selected' : ''}>-- Select control profile --</option>
                        ${typeSelectHtml}
                    </select>
                </div>
            </div>
    `;

    if (sub.type) {
        sub.config = sub.config || { 
            motorType: 'TalonFX', motorCount: 1, ratio: 1, kP: 0, kI: 0, kD: 0, kS: 0, kV: 0, kA: 0, kG: 0, 
            currentLimit: 40, idleMode: 'Brake', inverted: 'false', useSoftLimits: false, softLimitForward: 0, softLimitReverse: 0,
            leaderId: (idx + 1) * 10, canBus: 'rio', followers: [],
            exposedMethods: {}
        };
        
        sub.config.leaderId = sub.config.leaderId || (idx + 1) * 10;
        sub.config.canBus = sub.config.canBus || 'rio';
        sub.config.followers = sub.config.followers || [];
        sub.config.exposedMethods = sub.config.exposedMethods || {};

        const useMultiFile = robotState.general.logging === "advantagekit" || robotState.general.logging === "doglog";
        const currentSubTab = activePreviewTabs[idx] || "subsystem";

        const targetFollowerCount = Math.max(0, (parseInt(sub.config.motorCount) || 1) - 1);
        while (sub.config.followers.length < targetFollowerCount) {
            const fIndex = sub.config.followers.length;
            sub.config.followers.push({
                id: parseInt(sub.config.leaderId) + fIndex + 1,
                oppose: 'false'
            });
        }
        if (sub.config.followers.length > targetFollowerCount) {
            sub.config.followers = sub.config.followers.slice(0, targetFollowerCount);
        }

        let followerHtml = '';
        for (let i = 0; i < sub.config.followers.length; i++) {
            let follower = sub.config.followers[i];
            followerHtml += `
                <div class="hardware-group">
                    <div class="grid-layout">
                        <div>
                            <label style="color: var(--accent-neon);">Follower ${i + 1} Can ID</label>
                            <input type="number" min="1" max="62" class="val-follower-id" data-idx="${idx}" data-fidx="${i}" value="${follower.id}">
                        </div>
                        <div>
                            <label style="color: var(--accent-neon);">Follower ${i + 1} alignment</label>
                            <select class="val-follower-oppose" data-idx="${idx}" data-fidx="${i}">
                                <option value="false" ${follower.oppose === 'false' ? 'selected' : ''}>Match leader direction</option>
                                <option value="true" ${follower.oppose === 'true' ? 'selected' : ''}>Oppose leader direction</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }

        let methodCheckboxesHtml = '';
        const activeMechanism = sub.type;
        if (activeMechanism && mechanismsConfig[activeMechanism]) {
            const allowedMethods = mechanismsConfig[activeMechanism].defaultMethods || [];
            allowedMethods.forEach(methodKey => {
                const methodMeta = methodsConfig[methodKey];
                if (!methodMeta) return;

                if (sub.config.exposedMethods[methodKey] === undefined) {
                    sub.config.exposedMethods[methodKey] = true;
                }

                methodCheckboxesHtml += `
                    <label style="display:flex; align-items:center; gap:10px; color:#fff; cursor:pointer;">
                        <input type="checkbox" class="val-method-modular-check" data-methodkey="${methodKey}" data-idx="${idx}" ${sub.config.exposedMethods[methodKey] ? 'checked' : ''}> 
                        ${methodMeta.displayName}
                    </label>
                `;
            });
        } else {
            methodCheckboxesHtml = `<p style="color:#666; font-style:italic;">No custom routines found for this mechanism profile.</p>`;
        }

        html += `
            <div class="grid-layout" style="margin-top: 20px;">
                <div>
                    <label>Motor controller type</label>
                    <select class="val-cfg" data-field="motorType" data-idx="${idx}">
                        <option value="TalonFX" ${sub.config.motorType === 'TalonFX' ? 'selected' : ''}>TalonFX</option>
                        <option value="SparkMax" ${sub.config.motorType === 'SparkMax' ? 'selected' : ''}>SPARK MAX (Brushless)</option>
                        <option value="SparkFlex" ${sub.config.motorType === 'SparkFlex' ? 'selected' : ''}>SPARK Flex</option>
                    </select>
                </div>
                <div>
                    <label>Motor quantity (1 leader + followers)</label>
                    <input type="number" min="1" max="4" value="${sub.config.motorCount}" class="val-cfg val-motor-count" data-field="motorCount" data-idx="${idx}">
                </div>
                <div>
                    <label>Gearbox reduction (Gearing ratio)</label>
                    <input type="number" step="0.01" value="${sub.config.ratio}" class="val-cfg" data-field="ratio" data-idx="${idx}">
                </div>
            </div>

            <div class="grid-layout" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div>
                    <label>Leader Can ID</label>
                    <input type="number" min="1" max="62" value="${sub.config.leaderId}" class="val-cfg" data-field="leaderId" data-idx="${idx}">
                </div>
                <div>
                    <label>Can Bus name (CTRE only)</label>
                    <input type="text" value="${sub.config.canBus || 'rio'}" class="val-cfg" data-field="canBus" data-idx="${idx}" placeholder="rio, canivore, etc.">
                </div>
            </div>
            
            ${followerHtml}

            <div class="grid-layout" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div>
                    <label>Current limit (Amps)</label>
                    <input type="number" value="${sub.config.currentLimit || 40}" class="val-cfg" data-field="currentLimit" data-idx="${idx}">
                </div>
                <div>
                    <label>Idle mode (Neutral mode)</label>
                    <select class="val-cfg" data-field="idleMode" data-idx="${idx}">
                        <option value="Brake" ${sub.config.idleMode === 'Brake' ? 'selected' : ''}>Brake</option>
                        <option value="Coast" ${sub.config.idleMode === 'Coast' ? 'selected' : ''}>Coast</option>
                    </select>
                </div>
                <div>
                    <label>Leader inverted boolean</label>
                    <select class="val-cfg" data-field="inverted" data-idx="${idx}">
                        <option value="false" ${sub.config.inverted === 'false' ? 'selected' : ''}>False (ccw positive)</option>
                        <option value="true" ${sub.config.inverted === 'true' ? 'selected' : ''}>True (cw positive)</option>
                    </select>
                </div>
            </div>

            <div style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <label style="display:flex; align-items:center; gap:10px; color:#fff; cursor:pointer;">
                    <input type="checkbox" class="val-cfg-check" data-field="useSoftLimits" data-idx="${idx}" ${sub.config.useSoftLimits ? 'checked' : ''}> 
                    Enable hardware / software soft limits
                </label>
                <div class="grid-layout ${sub.config.useSoftLimits ? '' : 'hidden'}" id="soft-limits-box-${idx}" style="margin-top:15px;">
                    <div><label>Forward soft limit (Rotations)</label><input type="number" step="0.1" value="${sub.config.softLimitForward || 0}" class="val-cfg" data-field="softLimitForward" data-idx="${idx}"></div>
                    <div><label>Reverse soft limit (Rotations)</label><input type="number" step="0.1" value="${sub.config.softLimitReverse || 0}" class="val-cfg" data-field="softLimitReverse" data-idx="${idx}"></div>
                </div>
            </div>

            <div class="grid-layout" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div><label>Proportional gain (kP)</label><input type="number" step="0.001" value="${sub.config.kP}" class="val-cfg" data-field="kP" data-idx="${idx}"></div>
                <div><label>Integral gain (kI)</label><input type="number" step="0.001" value="${sub.config.kI}" class="val-cfg" data-field="kI" data-idx="${idx}"></div>
                <div><label>Derivative gain (kD)</label><input type="number" step="0.001" value="${sub.config.kD}" class="val-cfg" data-field="kD" data-idx="${idx}"></div>
            </div>

            <div class="grid-layout" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div style="grid-column: span 3;"><label style="font-weight: bold; color: var(--accent-neon);">Exposed Public Command Methods (Modular per Profile)</label></div>
                ${methodCheckboxesHtml}
            </div>

            <div class="code-preview-block">
                <div class="code-preview-tabs">
                    <button class="preview-tab-btn ${currentSubTab === 'subsystem' ? 'active-preview-tab' : ''}" data-idx="${idx}" data-tab="subsystem">${sub.name || 'Subsystem'}.java</button>
                    <button class="preview-tab-btn ${useMultiFile ? '' : 'hidden'} ${currentSubTab === 'interface' ? 'active-preview-tab' : ''}" data-idx="${idx}" data-tab="interface">${sub.name || 'Subsystem'}IO.java</button>
                    <button class="preview-tab-btn ${useMultiFile ? '' : 'hidden'} ${currentSubTab === 'real' ? 'active-preview-tab' : ''}" data-idx="${idx}" data-tab="real">${sub.name || 'Subsystem'}IOReal.java</button>
                    <button class="preview-tab-btn ${useMultiFile ? '' : 'hidden'} ${currentSubTab === 'sim' ? 'active-preview-tab' : ''}" data-idx="${idx}" data-tab="sim">${sub.name || 'Subsystem'}IOSim.java</button>
                </div>
                <pre class="code-preview"><code id="preview-code-${idx}"></code></pre>
            </div>
        </div>
    `;

    div.innerHTML = html;
    viewport.appendChild(div);
    splitWrapper.appendChild(sidebar);
    splitWrapper.appendChild(viewport);
    container.appendChild(splitWrapper);

    renderCodePreviewText(idx);
}}

function renderCommands() {
    const container = document.getElementById('commands-container');
    container.innerHTML = '';

    robotState.commands.forEach((cmd, idx) => {
        const div = document.createElement('div');
        div.className = 'subsystem-card';

        const subOptions = robotState.subsystems.map(s => 
            `<option value="${s.name}" ${cmd.subsystemName === s.name ? 'selected' : ''}>${s.name}</option>`
        ).join('');

        const subObj = robotState.subsystems.find(s => s.name === cmd.subsystemName);
        let methodOptions = '';
        if (subObj && subObj.type && mechanismsConfig[subObj.type]) {
            const allowed = mechanismsConfig[subObj.type].defaultMethods || [];
            allowed.forEach(mKey => {
                if (subObj.config?.exposedMethods?.[mKey]) {
                    const meta = methodsConfig[mKey];
                    methodOptions += `<option value="${mKey}" ${cmd.commandType === mKey ? 'selected' : ''}>${meta?.displayName || mKey}</option>`;
                }
            });
        }

        div.innerHTML = `
            <div class="card-header">
                <span>Command Instance: ${cmd.name || 'UnconfiguredCommand'}</span>
                <button class="btn-danger" data-idx="${idx}" action="del-cmd">Delete command</button>
            </div>
            <div class="card-body">
                <div class="grid-layout">
                    <div>
                        <label>Command class name</label>
                        <input type="text" value="${cmd.name || ''}" placeholder="e.g. RunIntake" class="val-cmd-name" data-idx="${idx}">
                    </div>
                    <div>
                        <label>Target Subsystem Dependency</label>
                        <select class="val-cmd-sub" data-idx="${idx}">
                            <option value="" disabled ${!cmd.subsystemName ? 'selected' : ''}>-- Select subsystem dependency --</option>
                            ${subOptions}
                        </select>
                    </div>
                    <div>
                        <label>Trigger Routine Action</label>
                        <select class="val-cmd-type" data-idx="${idx}">
                            <option value="" disabled ${!cmd.commandType ? 'selected' : ''}>-- Select trigger mapping --</option>
                            ${methodOptions}
                        </select>
                    </div>
                </div>
                <div class="code-preview-block">
                    <div class="code-preview-tabs">
                        <button class="preview-tab-btn active-preview-tab">${cmd.name || 'Command'}.java</button>
                    </div>
                    <pre class="code-preview"><code id="preview-command-${idx}"></code></pre>
                </div>
            </div>
        `;
        container.appendChild(div);
        renderCommandPreviewText(idx);
    });
}

function renderCommandPreviewText(idx) {
    const cmd = robotState.commands[idx];
    const previewContainer = document.getElementById(`preview-command-${idx}`);
    if (!previewContainer || !cmd.name || !cmd.subsystemName) return;

    const relatedSub = robotState.subsystems.find(s => s.name === cmd.subsystemName);
    let methodMeta = null;
    if (relatedSub && cmd.commandType) {
        methodMeta = methodsConfig[cmd.commandType];
    }

    const ctx = {
        name: cmd.name,
        subsystemName: cmd.subsystemName,
        subsystemVar: `m_${cmd.subsystemName.toLowerCase()}`,
        subsystemParam: cmd.subsystemName.toLowerCase(),
        isPercent: cmd.commandType === 'percent' || cmd.commandType === 'setPercentOutput',
        isClosedLoop: cmd.commandType === 'closedloop' || cmd.commandType === 'setClosedLoopTarget',
        isZero: cmd.commandType === 'zero' || cmd.commandType === 'zeroSensor'
    };

    if (methodMeta) {
        ctx.commandInitialize = methodMeta.commandInitialize ? Handlebars.compile(methodMeta.commandInitialize)(ctx) : '';
        ctx.commandExecute = methodMeta.commandExecute ? Handlebars.compile(methodMeta.commandExecute)(ctx) : '';
        ctx.commandIsFinished = methodMeta.commandIsFinished ? Handlebars.compile(methodMeta.commandIsFinished)(ctx) : 'return false;';
    }

    previewContainer.innerHTML = highlightJavaSyntax(Handlebars.compile(commandTemplate)(ctx));
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btn-tab-general').addEventListener('click', () => switchTab('tab-general'));
    document.getElementById('btn-tab-subsystems').addEventListener('click', () => switchTab('tab-subsystems'));
    document.getElementById('btn-tab-commands').addEventListener('click', () => switchTab('tab-commands'));
    document.getElementById('btn-tab-credits').addEventListener('click', () => switchTab('tab-credits'));

    document.getElementById('btn-add-subsystem').addEventListener('click', () => {
        robotState.subsystems.push({ name: '', type: '', config: {} });
        activeSubsystemIndex = robotState.subsystems.length - 1;
        saveState();
        renderSubsystems();
    });

    document.getElementById('btn-add-command').addEventListener('click', () => {
        robotState.commands.push({ name: '', subsystemName: '', commandType: '' });
        saveState();
        renderCommands();
    });

    document.addEventListener('click', (e) => {
        const subNav = e.target.closest('.sub-nav-item');
        if (subNav) {
            activeSubsystemIndex = parseInt(subNav.dataset.subnavidx);
            document.querySelectorAll('.sub-nav-item').forEach(btn => btn.classList.remove('active-sub-nav'));
            subNav.classList.add('active-sub-nav');
            renderSubsystems();
            return;
        }

        const previewTab = e.target.closest('.preview-tab-btn');
        if (previewTab && previewTab.dataset.idx !== undefined) {
            const sIdx = previewTab.dataset.idx;
            activePreviewTabs[sIdx] = previewTab.dataset.tab;
            renderCodePreviewText(sIdx);
            return;
        }

        const action = e.target.getAttribute('action');
        const idx = parseInt(e.target.dataset.idx);
        if (action === 'del-sub') {
            robotState.subsystems.splice(idx, 1);
            saveState();
            renderSubsystems();
        }
        if (action === 'del-cmd') {
            robotState.commands.splice(idx, 1);
            saveState();
            renderCommands();
        }
    });

    document.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (e.target.classList.contains('val-sub-name')) {
            robotState.subsystems[idx].name = e.target.value.replace(/\s+/g, '');
            saveState();
        }
        if (e.target.classList.contains('val-cmd-name')) {
            robotState.commands[idx].name = e.target.value.replace(/\s+/g, '');
            saveState();
        }
    });

    document.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        
        if (e.target.classList.contains('val-sub-type')) {
            robotState.subsystems[idx].type = e.target.value;
            robotState.subsystems[idx].config = {
                motorType: 'TalonFX', motorCount: 1, ratio: 1, kP: 0, kI: 0, kD: 0, kS: 0, kV: 0, kA: 0, kG: 0, 
                currentLimit: 40, idleMode: 'Brake', inverted: 'false', useSoftLimits: false, softLimitForward: 0, softLimitReverse: 0,
                leaderId: (idx + 1) * 10, canBus: 'rio', followers: [], exposedMethods: {}
            };
            saveState();
            renderSubsystems();
        }

        if (e.target.classList.contains('val-cfg')) {
            const field = e.target.dataset.field;
            let val = e.target.value;
            robotState.subsystems[idx].config[field] = val;
            saveState();
            if (e.target.classList.contains('val-motor-count') || field === 'leaderId') {
                renderSubsystems();
            } else {
                renderCodePreviewText(idx);
            }
        }

        if (e.target.classList.contains('val-cfg-check')) {
            const field = e.target.dataset.field;
            robotState.subsystems[idx].config[field] = e.target.checked;
            saveState();
            const softLimitsBox = document.getElementById(`soft-limits-box-${idx}`);
            if (softLimitsBox) {
                if (e.target.checked) softLimitsBox.classList.remove('hidden');
                else softLimitsBox.classList.add('hidden');
            }
            renderCodePreviewText(idx);
        }

        if (e.target.classList.contains('val-follower-id')) {
            const fidx = parseInt(e.target.dataset.fidx);
            robotState.subsystems[idx].config.followers[fidx].id = parseInt(e.target.value);
            saveState();
            renderCodePreviewText(idx);
        }

        if (e.target.classList.contains('val-follower-oppose')) {
            const fidx = parseInt(e.target.dataset.fidx);
            robotState.subsystems[idx].config.followers[fidx].oppose = e.target.value;
            saveState();
            renderCodePreviewText(idx);
        }

        if (e.target.classList.contains('val-method-modular-check')) {
            const methodKey = e.target.dataset.methodkey;
            robotState.subsystems[idx].config.exposedMethods[methodKey] = e.target.checked;
            saveState();
            renderCodePreviewText(idx);
        }

        if (e.target.classList.contains('val-cmd-sub')) {
            robotState.commands[idx].subsystemName = e.target.value;
            saveState();
            renderCommands();
        }

        if (e.target.classList.contains('val-cmd-type')) {
            robotState.commands[idx].commandType = e.target.value;
            saveState();
            renderCommandPreviewText(idx);
        }
    });

    const savedData = localStorage.getItem('robogen_state');
    if (savedData) {
        try {
            robotState = JSON.parse(savedData);
            if(!robotState.commands) robotState.commands = [];
        } catch(e) { console.error(e); }
    }
    
    const teamInput = document.getElementById('cfg-team');
    const loggingInput = document.getElementById('cfg-logging');
    if (teamInput && robotState.general?.team) teamInput.value = robotState.general.team;
    if (loggingInput && robotState.general?.logging) loggingInput.value = robotState.general.logging;

    renderSubsystems();
    
    if (loggingInput) loggingInput.addEventListener('change', () => { saveState(); renderSubsystems(); });
    if (teamInput) teamInput.addEventListener('change', saveState);
    
    const exportBtn = document.getElementById('btn-export');
    // Ensure both config profile mapping structures are passed securely to project construction methods
    if (exportBtn) exportBtn.addEventListener('click', () => buildProjectZip(robotState, methodsConfig, mechanismsConfig));

    switchTab('tab-general');
});