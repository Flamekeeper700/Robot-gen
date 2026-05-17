import { subsystemTemplate, ioInterfaceTemplate, ioRealTemplate, ioSimTemplate, commandTemplate } from './templates.js';

export function getSubsystemContext(sub, loggingType, leaderId, followerIds, methodsConfig = {}, mechanismsConfig = {}) {
    const config = sub.config || {};
    const rawFollowers = config.followers || [];

    const followersMapped = rawFollowers.map((f, i) => {
        return {
            id: parseInt(f.id) || (parseInt(config.leaderId || leaderId) + i + 1),
            oppose: f.oppose === 'true' || f.oppose === true,
            index: i + 1
        };
    });

    const isTalonFX = config.motorType ? config.motorType === 'TalonFX' : false;
    const isSpark = config.motorType ? (config.motorType === 'SparkMax' || config.motorType === 'SparkFlex') : false;

    // Base context profile
    const baseCtx = {
        name: sub.name || 'UnconfiguredSubsystem',
        package: `frc.robot.subsystems.${(sub.name || 'unconfigured').toLowerCase()}`,
        motorType: config.motorType || 'TalonFX',
        isTalonFX: isTalonFX,
        isSpark: isSpark,
        isSparkMax: config.motorType ? config.motorType === 'SparkMax' : false,
        isSparkFlex: config.motorType ? config.motorType === 'SparkFlex' : false,

        leaderId: parseInt(config.leaderId) || leaderId || 10,
        canBus: config.canBus || 'rio',
        followers: followersMapped,
        hasFollowers: followersMapped.length > 0,
        motorCount: followersMapped.length + 1,

        currentLimit: parseInt(config.currentLimit) || 40,
        idleMode: config.idleMode || 'Brake',
        inverted: config.inverted === 'true' || config.inverted === true,
        ratio: parseFloat(config.ratio) || 1.0,
        kP: parseFloat(config.kP) || 0.0,
        kI: parseFloat(config.kI) || 0.0,
        kD: parseFloat(config.kD) || 0.0,
        useSoftLimits: config.useSoftLimits || false,
        softLimitForward: parseFloat(config.softLimitForward) || 0.0,
        softLimitReverse: parseFloat(config.softLimitReverse) || 0.0,
        
        isPercent: sub.type === 'direct',
        isFlywheel: sub.type === 'flywheel',
        isElevator: sub.type === 'elevator',
        isArm: sub.type === 'arm'
    };

    // Dynamically compile only explicitly enabled modular methods
    const compiledMethods = [];
    if (sub.type && mechanismsConfig[sub.type]) {
        const allowedMethods = mechanismsConfig[sub.type].defaultMethods || [];
        allowedMethods.forEach(methodKey => {
            if (config.exposedMethods && config.exposedMethods[methodKey]) {
                const methodData = methodsConfig[methodKey];
                if (methodData && methodData.subsystemTemplate) {
                    // Compatibility fix: handle both Array and String templates cleanly
                    const rawTemplate = Array.isArray(methodData.subsystemTemplate) 
                        ? methodData.subsystemTemplate.join('\n') 
                        : methodData.subsystemTemplate;
                    const compiled = Handlebars.compile(rawTemplate)(baseCtx);
                    compiledMethods.push(compiled);
                }
            }
        });
    }
    baseCtx.compiledMethods = compiledMethods;
    return baseCtx;
}

export function buildProjectZip(robotState, methodsConfig = {}, mechanismsConfig = {}) {
    if (typeof JSZip === 'undefined') {
        console.error("JSZip dependency is missing from environment layout.");
        return;
    }
    const zip = new JSZip();
    const useMultiFile = robotState.general.logging === "advantagekit" || robotState.general.logging === "doglog";

    robotState.subsystems.forEach((sub, idx) => {
        if (!sub.name || !sub.type) return;

        const followerIds = (sub.config?.followers || []).map(f => f.id);
        const ctx = getSubsystemContext(sub, robotState.general.logging, sub.config.leaderId || 10, followerIds, methodsConfig, mechanismsConfig);
        const subFolder = `src/main/java/frc/robot/subsystems/${ctx.name.toLowerCase()}`;

        if (useMultiFile) {
            zip.file(`${subFolder}/${ctx.name}.java`, Handlebars.compile(subsystemTemplate)(ctx));
            zip.file(`${subFolder}/${ctx.name}IO.java`, Handlebars.compile(ioInterfaceTemplate)(ctx));
            zip.file(`${subFolder}/${ctx.name}IOReal.java`, Handlebars.compile(ioRealTemplate)(ctx));
            zip.file(`${subFolder}/${ctx.name}IOSim.java`, Handlebars.compile(ioSimTemplate)(ctx));
        } else {
            zip.file(`src/main/java/frc/robot/subsystems/${ctx.name}.java`, Handlebars.compile(subsystemTemplate)(ctx));
        }
    });

    robotState.commands.forEach((cmd) => {
        if (!cmd.name || !cmd.subsystemName) return;

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

        zip.file(`src/main/java/frc/robot/commands/${cmd.name}.java`, Handlebars.compile(commandTemplate)(ctx));
    });

    zip.file("deploy/team_info.txt", `FRC Team Name Parameter: ${robotState.general.team}\n`);

    zip.generateAsync({ type: "blob" }).then((content) => {
        if (typeof saveAs !== 'undefined') {
            saveAs(content, "robot_project.zip");
        } else {
            const url = window.URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = "robot_project.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    });
}