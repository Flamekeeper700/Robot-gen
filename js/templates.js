export const subsystemTemplate = `package {{package}};

import edu.wpi.first.wpilibj2.command.SubsystemBase;
import org.littletonrobotics.junction.Logger;

{{#if isTalonFX}}
import com.ctre.phoenix6.hardware.TalonFX;
import com.ctre.phoenix6.configs.TalonFXConfiguration;
import com.ctre.phoenix6.signals.NeutralModeValue;
import com.ctre.phoenix6.signals.InvertedValue;
import com.ctre.phoenix6.controls.Follower;
{{/if}}
{{#if isSpark}}
import com.revrobotics.spark.SparkMax;
import com.revrobotics.spark.SparkBase.IdleMode;
import com.revrobotics.spark.config.SparkMaxConfig;
import com.revrobotics.spark.config.SparkBase.PersistMode;
import com.revrobotics.spark.config.SparkBase.ResetMode;
{{/if}}

public class {{name}} extends SubsystemBase {
    
    // Hardware Declarations
    {{#if isTalonFX}}
    private final TalonFX m_leader = new TalonFX({{leaderId}}, "{{canBus}}");
    {{#each followers}}
    private final TalonFX m_follower{{this.index}} = new TalonFX({{this.id}}, "{{../canBus}}");
    {{/each}}
    {{/if}}
    {{#if isSpark}}
    private final SparkMax m_leader = new SparkMax({{leaderId}}, SparkMax.MotorType.kBrushless);
    {{#each followers}}
    private final SparkMax m_follower{{this.index}} = new SparkMax({{this.id}}, SparkMax.MotorType.kBrushless);
    {{/each}}
    {{/if}}

    public {{name}}() {
        configureHardware();
    }

    private void configureHardware() {
        {{#if isTalonFX}}
        TalonFXConfiguration config = new TalonFXConfiguration();
        
        // Current Limits & Idle Mode
        config.CurrentLimits.StatorCurrentLimit = {{currentLimit}};
        config.CurrentLimits.StatorCurrentLimitEnable = true;
        config.MotorOutput.NeutralMode = NeutralModeValue.{{idleMode}}Value;
        config.MotorOutput.Inverted = {{#if inverted}}InvertedValue.Clockwise_Positive{{else}}InvertedValue.CounterClockwise_Positive{{/if}};
        
        // PID Controller Constants
        config.Slot0.kP = {{kP}};
        config.Slot0.kI = {{kI}};
        config.Slot0.kD = {{kD}};

        // Soft Limits Configuration
        {{#if useSoftLimits}}
        config.SoftwareLimitSwitch.ForwardSoftLimitThreshold = {{softLimitForward}};
        config.SoftwareLimitSwitch.ForwardSoftLimitEnable = true;
        config.SoftwareLimitSwitch.ReverseSoftLimitThreshold = {{softLimitReverse}};
        config.SoftwareLimitSwitch.ReverseSoftLimitEnable = true;
        {{/if}}

        m_leader.getConfigurator().apply(config);

        // Follower Configurations
        {{#each followers}}
        m_follower{{this.index}}.setControl(new Follower(m_leader.getDeviceID(), {{#if this.oppose}}true{{else}}false{{/if}}));
        {{/each}}
        {{/if}}

        {{#if isSpark}}
        SparkMaxConfig config = new SparkMaxConfig();
        config.smartCurrentLimit({{currentLimit}});
        config.idleMode(IdleMode.k{{idleMode}});
        config.inverted({{inverted}});

        // PID Controller Constants
        config.closedLoop.p({{kP}}).i({{kI}}).d({{kD}});

        // Soft Limits Configuration
        {{#if useSoftLimits}}
        config.softLimit.forwardSoftLimit({{softLimitForward}}).forwardSoftLimitEnabled(true);
        config.softLimit.reverseSoftLimit({{softLimitReverse}}).reverseSoftLimitEnabled(true);
        {{/if}}

        m_leader.configure(config, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);

        {{#each followers}}
        SparkMaxConfig followerConfig{{this.index}} = new SparkMaxConfig();
        followerConfig{{this.index}}.follow(m_leader, {{#if this.oppose}}true{{else}}false{{/if}});
        m_follower{{this.index}}.configure(followerConfig{{this.index}}, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);
        {{/each}}
        {{/if}}
    }

    {{#each compiledMethods}}
{{{this}}}
    {{/each}}

    @Override
    public void periodic() {
        // Periodic updates
    }
}`;

export const ioInterfaceTemplate = `package {{package}};

import org.littletonrobotics.junction.LogTable;
import org.littletonrobotics.junction.inputs.LogRecord;

public interface {{name}}IO {
    public static class {{name}}IOInputs {
        public double positionRotations = 0.0;
        public double velocityRPM = 0.0;
        public double appliedVolts = 0.0;
        public double currentAmps = 0.0;
    }

    /** Updates the set of loggable inputs. */
    public default void updateInputs({{name}}IOInputs inputs) {}

    /** Run the motor at a specified voltage output. */
    public default void setVoltage(double volts) {}
}`;

export const ioRealTemplate = `package {{package}};\n
public class {{name}}IOReal implements {{name}}IO {
    // Configured for physical {{motorType}} (Leader CAN ID: {{leaderId}})
    public {{name}}IOReal() {
        // Setup motor layout and configurations
    }

    @Override
    public void updateInputs({{name}}IOInputs inputs) {
        // Assign values from real motor sensors to the inputs container
    }

    @Override
    public void setVoltage(double volts) {
        // Write voltage outputs to hardware controller
    }
}`;

export const ioSimTemplate = `package {{package}};\n
public class {{name}}IOSim implements {{name}}IO {
    // Configured physics simulation model
    public {{name}}IOSim() {
        // Initialize DCMotor simulation models
    }

    @Override
    public void updateInputs({{name}}IOInputs inputs) {
        // Advance physics simulation clock and map state
    }

    @Override
    public void setVoltage(double volts) {
        // Write simulation physical input parameters
    }
}`;

export const commandTemplate = `package frc.robot.commands;

import edu.wpi.first.wpilibj2.command.Command;
import frc.robot.subsystems.{{subsystemParam}}.{{subsystemName}};

public class {{name}} extends Command {
    private final {{subsystemName}} m_subsystem;
    {{#if isPercent}}
    private double m_percent = 0.0;
    {{/if}}
    {{#if isClosedLoop}}
    private double m_target = 0.0;
    {{/if}}

    public {{name}}({{subsystemName}} subsystem{{#if isPercent}}, double percent{{/if}}{{#if isClosedLoop}}, double target{{/if}}) {
        this.m_subsystem = subsystem;
        {{#if isPercent}}
        this.m_percent = percent;
        {{/if}}
        {{#if isClosedLoop}}
        this.m_target = target;
        {{/if}}
        addRequirements(m_subsystem);
    }

    @Override
    public void initialize() {
        {{{commandInitialize}}}
    }

    @Override
    public void execute() {
        {{{commandExecute}}}
    }

    @Override
    public boolean isFinished() {
        {{{commandIsFinished}}}
    }

    @Override
    public void end(boolean interrupted) {
        m_subsystem.setPercentOutput(0.0);
    }
}`;