import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MOTOR_COUNT,
  clampPwm,
  createChartConfig,
  createDefaultSetpoints,
  flowFromPwm,
  newId,
  pwmFromFlow,
  pumpName,
  withCalibrationAtScope,
  calibrationForScope,
  type Calibration,
  type CalibrationRecord,
  type CalibrationScope,
  type PumpCalibrationSet,
  type PumpChartConfig,
  type PumpDirection,
  type PumpSetpoint,
} from "../lib/calibration";
import {
  commands,
  createEmptyState,
  emptyProgramStatus,
  errorText,
  isOwnedState,
  parseLine,
  type ProgramState,
  type ProgramStatus,
} from "../lib/protocol";
import { compileProgram, programLines } from "../lib/programCompiler";
import type { ExperimentBlock } from "../lib/experiment";
import { SerialClient, listSerialPorts, serialSupported, type ComPort } from "../lib/serial";
import {
  loadCalibrations,
  loadChartLayouts,
  loadPreferences,
  saveCalibrations,
  saveChartLayouts,
  savePreferences,
} from "../lib/storage";
import {
  resolveCalibration,
  sanitizePreferences,
  withManualPick,
  initialVolumeFor,
  type ConfirmationPreferences,
  type DisplayPreferences,
  type FlowSignMode,
  type Preferences,
  type ResolvedCalibration,
} from "../lib/preferences";
import type { TelemetrySample } from "../components/FlowChart";

export type DisplayPump = {
  id: number;
  name: string;
  running: boolean;
  direction: PumpDirection;
  pwm: number;
  speed: number;
  calibration: Calibration;
  calibrationSet: PumpCalibrationSet;
  calibrationChoice: ResolvedCalibration;
};

type RawSample = {
  t: number;
  flow: number;
  signedVolume: number;
  absoluteVolume: number;
};

type PumpTelemetry = {
  monitoring: boolean;
  signedVolume: number;
  absoluteVolume: number;
  lastT: number;
  samples: RawSample[];
};

const CLOCK_SYNC_MS = 60000;
const PROGRAM_ACK_MS = 5000;

function emptyPrograms(): ProgramStatus[] {
  return Array.from({ length: MOTOR_COUNT }, emptyProgramStatus);
}

type ReportWaiter = {
  id: number;
  accept: ProgramState[];
  resolve: (status: ProgramStatus) => void;
  reject: (error: Error) => void;
};

function emptyTelemetry(): PumpTelemetry[] {
  return Array.from({ length: MOTOR_COUNT }, () => ({
    monitoring: false,
    signedVolume: 0,
    absoluteVolume: 0,
    lastT: 0,
    samples: [],
  }));
}

type BenchContextValue = {
  serialOk: boolean;
  connected: boolean;
  connecting: boolean;
  portLabel: string;
  error: string | null;
  pumps: DisplayPump[];
  globalPwm: number;
  knownPorts: ComPort[];
  refreshPorts: () => Promise<void>;
  connectTo: (portPath: string, label?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setPwm: (id: number, pwm: number) => void;
  setDirection: (id: number, direction: PumpDirection) => void;
  toggleRunning: (id: number) => void;
  setEnabled: (id: number, enabled: boolean) => void;
  setCalibration: (
    id: number,
    scope: CalibrationScope,
    calibration: Calibration,
  ) => void;
  saveCalibrationHistory: (id: number, scope: CalibrationScope, name: string) => void;
  applyCalibrationHistory: (id: number, record: CalibrationRecord) => void;
  preferences: Preferences;
  setCalibrationPolicy: (policy: Preferences["calibrationPolicy"]) => void;
  setManualCalibration: (
    id: number,
    scope: CalibrationScope,
    recordId: string,
  ) => void;
  setDisplayPreference: (key: keyof DisplayPreferences, value: boolean) => void;
  setConfirmation: (key: keyof ConfirmationPreferences, value: boolean) => void;
  setFlowSign: (mode: FlowSignMode) => void;
  setInitialVolume: (id: number, volume: number) => void;
  programSupport: boolean;
  clockSynced: boolean;
  programs: ProgramStatus[];
  programEstimates: (number | null)[];
  programOwns: (id: number) => boolean;
  runProgram: (id: number, blocks: ExperimentBlock[], startAt: number | null) => Promise<void>;
  pauseProgram: (id: number) => void;
  resumeProgram: (id: number) => void;
  stopProgram: (id: number) => void;
  setFlow: (id: number, flow: number) => void;
  setGlobalPwm: (pwm: number) => void;
  applyGlobalPwm: (pwm: number) => void;
  stopAll: () => void;
  chartsFor: (id: number) => PumpChartConfig[];
  samplesFor: (id: number) => TelemetrySample[];
  volumeFor: (id: number) => number;
  monitoringFor: (id: number) => boolean;
  addChart: (id: number) => void;
  updateChart: (id: number, chart: PumpChartConfig) => void;
  removeChart: (id: number, chartId: string) => void;
  resetTelemetry: (id: number) => void;
};

const BenchContext = createContext<BenchContextValue | null>(null);

function toDisplay(
  connected: boolean,
  setpoints: PumpSetpoint[],
  calibrations: PumpCalibrationSet[],
  preferences: Preferences,
): DisplayPump[] {
  return setpoints.map((setpoint, index) => {
    const id = index + 1;
    const pwm = connected ? setpoint.pwm : 0;
    const running = connected && setpoint.enabled;
    const set = calibrations[index];
    const calibrationChoice = resolveCalibration(
      set,
      setpoint.direction,
      preferences,
      id,
    );
    const calibration = calibrationChoice.calibration;
    return {
      id,
      name: pumpName(id),
      running,
      direction: connected ? setpoint.direction : "forward",
      pwm,
      speed: running ? Math.max(0, flowFromPwm(pwm, calibration)) : 0,
      calibration,
      calibrationSet: set,
      calibrationChoice,
    };
  });
}

export function BenchProvider({ children }: { children: ReactNode }) {
  const serialOk = serialSupported();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [portLabel, setPortLabel] = useState("Nenhuma porta");
  const [error, setError] = useState<string | null>(null);
  const [setpoints, setSetpoints] = useState(createDefaultSetpoints);
  const [calibrations, setCalibrations] = useState(loadCalibrations);
  const [preferences, setPreferencesState] = useState(loadPreferences);
  const [charts, setCharts] = useState(loadChartLayouts);
  const [telemetry, setTelemetry] = useState<PumpTelemetry[]>(() =>
    loadChartLayouts().map((list) => ({
      monitoring: list.length > 0,
      signedVolume: 0,
      absoluteVolume: 0,
      lastT: 0,
      samples: [],
    })),
  );
  const [globalPwm, setGlobalPwmState] = useState(0);
  const [knownPorts, setKnownPorts] = useState<ComPort[]>([]);
  const [programSupport, setProgramSupport] = useState(false);
  const [clockSynced, setClockSynced] = useState(false);
  const [programs, setPrograms] = useState(emptyPrograms);
  const [programEstimates, setProgramEstimates] = useState<(number | null)[]>(() =>
    Array.from({ length: MOTOR_COUNT }, () => null),
  );

  const sampleRef = useRef({
    connected: false,
    setpoints: createDefaultSetpoints(),
    calibrations: loadCalibrations(),
    preferences: loadPreferences(),
    telemetry: emptyTelemetry(),
  });
  sampleRef.current = {
    connected,
    setpoints,
    calibrations,
    preferences,
    telemetry,
  };
  const clientRef = useRef<SerialClient | null>(null);
  const connectedRef = useRef(false);
  const pwmTimers = useRef<Record<number, number>>({});
  const heartbeatRef = useRef<number | null>(null);
  const helloWaitRef = useRef<((ok: boolean) => void) | null>(null);
  const programSupportRef = useRef(false);
  const programsRef = useRef(programs);
  programsRef.current = programs;
  const lastClockSyncRef = useRef(0);
  const reportWaitersRef = useRef(new Set<ReportWaiter>());

  const programOwns = useCallback(
    (id: number) => isOwnedState(programsRef.current[id - 1]?.state ?? "empty"),
    [],
  );

  const rejectWaiters = useCallback((error: Error) => {
    const waiters = [...reportWaitersRef.current];
    reportWaitersRef.current.clear();
    waiters.forEach((waiter) => waiter.reject(error));
  }, []);

  const send = useCallback(async (line: string) => {
    if (!clientRef.current?.connected) {
      return;
    }
    try {
      await clientRef.current.write(line);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao enviar.");
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const dropConnection = useCallback(
    async (reason?: string) => {
      connectedRef.current = false;
      clearHeartbeat();
      Object.values(pwmTimers.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      pwmTimers.current = {};
      helloWaitRef.current?.(false);
      helloWaitRef.current = null;
      rejectWaiters(new Error("Arduino desconectado."));
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        try {
          await client.write(
            programSupportRef.current ? commands.stopManual() : commands.stopAll(),
          );
        } catch {
          /* porta já pode ter caído */
        }
        await client.disconnect();
      }
      programSupportRef.current = false;
      setConnected(false);
      setConnecting(false);
      setSetpoints(createDefaultSetpoints());
      setGlobalPwmState(0);
      setProgramSupport(false);
      setClockSynced(false);
      setPrograms(emptyPrograms());
      if (reason) {
        setError(reason);
      }
    },
    [clearHeartbeat, rejectWaiters],
  );

  const refreshPorts = useCallback(async () => {
    if (!serialOk) {
      setKnownPorts([]);
      return;
    }
    setKnownPorts(await listSerialPorts());
  }, [serialOk]);

  const connectTo = useCallback(
    async (portPath: string, label?: string) => {
      setConnecting(true);
      setError(null);
      await dropConnection();
      setConnecting(true);

      const client = new SerialClient({
        onLine: (raw) => {
          const line = parseLine(raw);
          if (!line) {
            return;
          }
          if (line.kind === "hello") {
            programSupportRef.current = line.programs;
            helloWaitRef.current?.(true);
            helloWaitRef.current = null;
            return;
          }
          if (line.kind === "error") {
            if (reportWaitersRef.current.size > 0) {
              rejectWaiters(new Error(line.message));
            } else {
              setError(line.message);
            }
            return;
          }
          if (line.kind === "clock") {
            setClockSynced(line.epochMs > 0);
            return;
          }
          if (line.kind === "report") {
            setPrograms((current) =>
              current.map((item, index) => (index === line.id - 1 ? line.status : item)),
            );
            reportWaitersRef.current.forEach((waiter) => {
              if (waiter.id === line.id && waiter.accept.includes(line.status.state)) {
                reportWaitersRef.current.delete(waiter);
                waiter.resolve(line.status);
              }
            });
            return;
          }
          if (line.kind === "state" && connectedRef.current) {
            setSetpoints(line.pumps);
          }
        },
        onDisconnect: (reason) => {
          void dropConnection(reason);
        },
      });

      try {
        await client.connect(portPath);
        clientRef.current = client;
        setPortLabel(label || portPath);

        const hello = new Promise<boolean>((resolve) => {
          helloWaitRef.current = resolve;
          window.setTimeout(() => resolve(false), 4000);
        });
        await client.write(commands.hello());
        const ok = await hello;
        if (!ok) {
          throw new Error(
            "A porta não respondeu como interface.ino. Confira o firmware e a COM.",
          );
        }

        connectedRef.current = true;
        setConnected(true);
        setProgramSupport(programSupportRef.current);
        if (programSupportRef.current) {
          lastClockSyncRef.current = Date.now();
          await client.write(commands.time(Date.now()));
        }
        await client.write(commands.get());
        heartbeatRef.current = window.setInterval(() => {
          if (
            programSupportRef.current &&
            Date.now() - lastClockSyncRef.current >= CLOCK_SYNC_MS
          ) {
            lastClockSyncRef.current = Date.now();
            void send(commands.time(Date.now()));
          }
          void send(commands.get());
        }, 1500);
        await refreshPorts();
      } catch (caught) {
        await client.disconnect();
        clientRef.current = null;
        connectedRef.current = false;
        setConnected(false);
        setError(
          caught instanceof Error ? caught.message : "Falha ao abrir a porta COM.",
        );
      } finally {
        setConnecting(false);
      }
    },
    [dropConnection, refreshPorts, rejectWaiters, send],
  );

  const disconnect = useCallback(async () => {
    await dropConnection();
    setError(null);
  }, [dropConnection]);

  const queuePwm = useCallback(
    (id: number, pwm: number) => {
      const previous = pwmTimers.current[id];
      if (previous) {
        window.clearTimeout(previous);
      }
      pwmTimers.current[id] = window.setTimeout(() => {
        delete pwmTimers.current[id];
        void send(commands.pwm(id, pwm));
      }, 80);
    },
    [send],
  );

  const setPwm = useCallback(
    (id: number, pwm: number) => {
      if (programOwns(id)) {
        return;
      }
      const next = clampPwm(pwm);
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, pwm: next } : pump,
        ),
      );
      queuePwm(id, next);
    },
    [programOwns, queuePwm],
  );

  const setDirection = useCallback(
    (id: number, direction: PumpDirection) => {
      if (programOwns(id)) {
        return;
      }
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, direction } : pump,
        ),
      );
      void send(commands.direction(id, direction));
    },
    [programOwns, send],
  );

  const setEnabled = useCallback(
    (id: number, enabled: boolean) => {
      if (programOwns(id)) {
        return;
      }
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, enabled } : pump,
        ),
      );
      void send(commands.enable(id, enabled));
    },
    [programOwns, send],
  );

  const toggleRunning = useCallback(
    (id: number) => {
      const current = setpoints[id - 1];
      if (!current || programOwns(id)) {
        return;
      }
      const enabled = !current.enabled;
      const pwm0 = resolveCalibration(
        calibrations[id - 1],
        current.direction,
        preferences,
        id,
      ).calibration.pwm0;
      const pwm = enabled && current.pwm === 0 ? pwm0 : current.pwm;
      setSetpoints((pumps) =>
        pumps.map((pump, index) =>
          index === id - 1 ? { ...pump, enabled, pwm } : pump,
        ),
      );
      if (pwm !== current.pwm) {
        void send(commands.pwm(id, pwm));
      }
      void send(commands.enable(id, enabled));
    },
    [calibrations, preferences, programOwns, send, setpoints],
  );

  const persistCalibrations = useCallback((next: PumpCalibrationSet[]) => {
    saveCalibrations(next);
    return next;
  }, []);

  const setCalibration = useCallback(
    (id: number, scope: CalibrationScope, calibration: Calibration) => {
      setCalibrations((current) =>
        persistCalibrations(
          current.map((item, index) =>
            index === id - 1
              ? withCalibrationAtScope(item, scope, calibration)
              : item,
          ),
        ),
      );
    },
    [persistCalibrations],
  );

  const saveCalibrationHistory = useCallback(
    (id: number, scope: CalibrationScope, name: string) => {
      setCalibrations((current) =>
        persistCalibrations(
          current.map((item, index) => {
            if (index !== id - 1) {
              return item;
            }
            const calibration = calibrationForScope(item, scope);
            const record: CalibrationRecord = {
              id: newId(),
              name: name.trim(),
              savedAt: Date.now(),
              scope,
              calibration,
            };
            return {
              ...item,
              history: [record, ...item.history].slice(0, 40),
            };
          }),
        ),
      );
    },
    [persistCalibrations],
  );

  const applyCalibrationHistory = useCallback(
    (id: number, record: CalibrationRecord) => {
      setCalibration(id, record.scope, record.calibration);
      setPreferencesState((current) => {
        const next = withManualPick(current, id, record.scope, record.id);
        savePreferences(next);
        return next;
      });
    },
    [setCalibration],
  );

  const persistPreferences = useCallback((next: Preferences) => {
    const clean = sanitizePreferences(next);
    savePreferences(clean);
    return clean;
  }, []);

  const setCalibrationPolicy = useCallback(
    (policy: Preferences["calibrationPolicy"]) => {
      setPreferencesState((current) =>
        persistPreferences({ ...current, calibrationPolicy: policy }),
      );
    },
    [persistPreferences],
  );

  const setManualCalibration = useCallback(
    (id: number, scope: CalibrationScope, recordId: string) => {
      setPreferencesState((current) =>
        persistPreferences(withManualPick(current, id, scope, recordId)),
      );
    },
    [persistPreferences],
  );

  const setDisplayPreference = useCallback(
    (key: keyof DisplayPreferences, value: boolean) => {
      setPreferencesState((current) =>
        persistPreferences({
          ...current,
          display: { ...current.display, [key]: value },
        }),
      );
    },
    [persistPreferences],
  );

  const setFlowSign = useCallback(
    (mode: FlowSignMode) => {
      setPreferencesState((current) =>
        persistPreferences({
          ...current,
          telemetry: { ...current.telemetry, flowSign: mode },
        }),
      );
    },
    [persistPreferences],
  );

  const setInitialVolume = useCallback(
    (id: number, volume: number) => {
      setPreferencesState((current) =>
        persistPreferences({
          ...current,
          telemetry: {
            ...current.telemetry,
            initialVolumes: {
              ...current.telemetry.initialVolumes,
              [String(id)]: Number.isFinite(volume) ? volume : 0,
            },
          },
        }),
      );
    },
    [persistPreferences],
  );

  const setConfirmation = useCallback(
    (key: keyof ConfirmationPreferences, value: boolean) => {
      setPreferencesState((current) =>
        persistPreferences({
          ...current,
          confirmations: { ...current.confirmations, [key]: value },
        }),
      );
    },
    [persistPreferences],
  );

  const persistCharts = useCallback((next: PumpChartConfig[][]) => {
    saveChartLayouts(next);
    return next;
  }, []);

  const addChart = useCallback((id: number) => {
    setCharts((current) =>
      persistCharts(
        current.map((list, index) =>
          index === id - 1 ? [...list, createChartConfig()].slice(0, 6) : list,
        ),
      ),
    );
    setTelemetry((current) =>
      current.map((item, index) =>
        index === id - 1 ? { ...item, monitoring: true } : item,
      ),
    );
  }, [persistCharts]);

  const updateChart = useCallback((id: number, chart: PumpChartConfig) => {
    setCharts((current) =>
      persistCharts(
        current.map((list, index) =>
          index === id - 1
            ? list.map((item) => (item.id === chart.id ? chart : item))
            : list,
        ),
      ),
    );
  }, [persistCharts]);

  const removeChart = useCallback((id: number, chartId: string) => {
    setCharts((current) =>
      persistCharts(
        current.map((list, index) =>
          index === id - 1 ? list.filter((item) => item.id !== chartId) : list,
        ),
      ),
    );
  }, [persistCharts]);

  const resetTelemetry = useCallback((id: number) => {
    setTelemetry((current) =>
      current.map((item, index) =>
        index === id - 1
          ? { ...item, signedVolume: 0, absoluteVolume: 0, lastT: 0, samples: [] }
          : item,
      ),
    );
  }, []);

  const telemetryView = useMemo(() => {
    const signed = preferences.telemetry.flowSign === "signed";
    return telemetry.map((item, index) => {
      const initial = initialVolumeFor(preferences, index + 1);
      return {
        volume: initial + (signed ? item.signedVolume : item.absoluteVolume),
        samples: item.samples.map(
          (sample): TelemetrySample => ({
            t: sample.t,
            flow: signed ? sample.flow : Math.abs(sample.flow),
            volume: initial + (signed ? sample.signedVolume : sample.absoluteVolume),
          }),
        ),
      };
    });
  }, [preferences, telemetry]);

  const chartsFor = useCallback((id: number) => charts[id - 1] ?? [], [charts]);
  const samplesFor = useCallback(
    (id: number) => telemetryView[id - 1]?.samples ?? [],
    [telemetryView],
  );
  const volumeFor = useCallback(
    (id: number) => telemetryView[id - 1]?.volume ?? 0,
    [telemetryView],
  );
  const monitoringFor = useCallback(
    (id: number) => telemetry[id - 1]?.monitoring ?? false,
    [telemetry],
  );

  const setFlow = useCallback(
    (id: number, flow: number) => {
      const setpoint = setpoints[id - 1];
      const pwm = pwmFromFlow(
        flow,
        resolveCalibration(
          calibrations[id - 1],
          setpoint?.direction ?? "forward",
          preferences,
          id,
        ).calibration,
      );
      setPwm(id, pwm);
    },
    [calibrations, preferences, setPwm, setpoints],
  );

  const setGlobalPwm = useCallback((pwm: number) => {
    setGlobalPwmState(clampPwm(pwm));
  }, []);

  const applyGlobalPwm = useCallback(
    (pwm: number) => {
      const next = clampPwm(pwm);
      setGlobalPwmState(next);
      setSetpoints((current) =>
        current.map((pump, index) =>
          programOwns(index + 1)
            ? pump
            : {
                ...pump,
                pwm: next,
                enabled: next > 0 || pump.enabled,
              },
        ),
      );
      for (let id = 1; id <= MOTOR_COUNT; id++) {
        if (programOwns(id)) {
          continue;
        }
        void send(commands.pwm(id, next));
        if (next > 0) {
          void send(commands.enable(id, true));
        }
      }
    },
    [programOwns, send],
  );

  const stopAll = useCallback(() => {
    setSetpoints((current) =>
      current.map((pump) => ({ ...pump, enabled: false, pwm: 0 })),
    );
    setGlobalPwmState(0);
    void send(commands.stopAll());
  }, [send]);

  const waitForProgram = useCallback(
    (id: number, accept: ProgramState[]) =>
      new Promise<ProgramStatus>((resolve, reject) => {
        const waiter: ReportWaiter = {
          id,
          accept,
          resolve: (status) => {
            window.clearTimeout(timer);
            resolve(status);
          },
          reject: (reason) => {
            window.clearTimeout(timer);
            reject(reason);
          },
        };
        const timer = window.setTimeout(() => {
          reportWaitersRef.current.delete(waiter);
          reject(new Error("A placa não confirmou o programa. Confira a conexão e envie novamente."));
        }, PROGRAM_ACK_MS);
        reportWaitersRef.current.add(waiter);
      }),
    [],
  );

  const runProgram = useCallback(
    async (id: number, blocks: ExperimentBlock[], startAt: number | null) => {
      const client = clientRef.current;
      if (!client?.connected || !connectedRef.current) {
        throw new Error("Conecte o Arduino para executar o programa.");
      }
      if (!programSupportRef.current) {
        throw new Error(
          "O firmware da placa não aceita programas. Grave o sketch Arduino/interface_prog.",
        );
      }
      if (programOwns(id)) {
        throw new Error("Já há um programa ativo nesta bomba. Pare-o antes de enviar outro.");
      }
      if (startAt !== null && startAt <= Date.now()) {
        throw new Error("Escolha um horário no futuro para agendar.");
      }
      const program = compileProgram(blocks);
      const set = calibrations[id - 1];
      const forward = resolveCalibration(set, "forward", preferences, id).calibration;
      const reverse = resolveCalibration(set, "reverse", preferences, id).calibration;
      const lines = programLines(id, program, forward, reverse, startAt);

      lastClockSyncRef.current = Date.now();
      await client.write(commands.time(Date.now()));
      const accepted = waitForProgram(id, ["waiting", "running"]);
      try {
        for (const line of lines) {
          await client.write(line);
        }
      } catch (caught) {
        rejectWaiters(caught instanceof Error ? caught : new Error("Falha ao enviar."));
      }
      await accepted;
      setProgramEstimates((current) =>
        current.map((item, index) => (index === id - 1 ? program.estimatedSeconds : item)),
      );
    },
    [calibrations, preferences, programOwns, rejectWaiters, waitForProgram],
  );

  const pauseProgram = useCallback(
    (id: number) => {
      void send(commands.programPause(id, true));
    },
    [send],
  );

  const resumeProgram = useCallback(
    (id: number) => {
      void send(commands.programPause(id, false));
    },
    [send],
  );

  const stopProgram = useCallback(
    (id: number) => {
      void send(commands.programStop(id));
    },
    [send],
  );

  useEffect(() => {
    void refreshPorts();
  }, [refreshPorts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = sampleRef.current;
      const now = Date.now();
      setTelemetry((current) => {
        let changed = false;
        const next = current.map((item, index) => {
          if (!item.monitoring) {
            return item;
          }
          changed = true;
          const setpoint = snapshot.setpoints[index];
          const running = snapshot.connected && setpoint.enabled;
          const calibration = resolveCalibration(
            snapshot.calibrations[index],
            setpoint.direction,
            snapshot.preferences,
            index + 1,
          ).calibration;
          const magnitude = running
            ? Math.max(0, flowFromPwm(setpoint.pwm, calibration))
            : 0;
          const flow = setpoint.direction === "reverse" ? -magnitude : magnitude;
          const dt = item.lastT > 0 ? Math.min(1000, now - item.lastT) : 0;
          const signedVolume = item.signedVolume + flow * (dt / 60000);
          const absoluteVolume = item.absoluteVolume + magnitude * (dt / 60000);
          const samples = [
            ...item.samples,
            { t: now, flow, signedVolume, absoluteVolume },
          ].slice(-7200);
          return { ...item, lastT: now, signedVolume, absoluteVolume, samples };
        });
        return changed ? next : current;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const dropRef = useRef(dropConnection);
  dropRef.current = dropConnection;

  useEffect(() => {
    return () => {
      void dropRef.current();
    };
  }, []);

  const pumps = useMemo(
    () => toDisplay(connected, setpoints, calibrations, preferences),
    [calibrations, connected, preferences, setpoints],
  );

  const value = useMemo<BenchContextValue>(
    () => ({
      serialOk,
      connected,
      connecting,
      portLabel,
      error,
      pumps,
      globalPwm: connected ? globalPwm : 0,
      knownPorts,
      refreshPorts,
      connectTo,
      disconnect,
      setPwm,
      setDirection,
      toggleRunning,
      setEnabled,
      setCalibration,
      saveCalibrationHistory,
      applyCalibrationHistory,
      preferences,
      setCalibrationPolicy,
      setManualCalibration,
      setDisplayPreference,
      setConfirmation,
      setFlowSign,
      setInitialVolume,
      programSupport: connected && programSupport,
      clockSynced: connected && clockSynced,
      programs,
      programEstimates,
      programOwns,
      runProgram,
      pauseProgram,
      resumeProgram,
      stopProgram,
      setFlow,
      setGlobalPwm,
      applyGlobalPwm,
      stopAll,
      chartsFor,
      samplesFor,
      volumeFor,
      monitoringFor,
      addChart,
      updateChart,
      removeChart,
      resetTelemetry,
    }),
    [
      addChart,
      applyCalibrationHistory,
      applyGlobalPwm,
      preferences,
      setCalibrationPolicy,
      setDisplayPreference,
      setConfirmation,
      setFlowSign,
      setInitialVolume,
      programSupport,
      clockSynced,
      programs,
      programEstimates,
      programOwns,
      runProgram,
      pauseProgram,
      resumeProgram,
      stopProgram,
      setManualCalibration,
      chartsFor,
      connectTo,
      connected,
      connecting,
      disconnect,
      error,
      globalPwm,
      knownPorts,
      monitoringFor,
      portLabel,
      pumps,
      refreshPorts,
      removeChart,
      resetTelemetry,
      samplesFor,
      saveCalibrationHistory,
      serialOk,
      setCalibration,
      setDirection,
      setEnabled,
      setFlow,
      setGlobalPwm,
      setPwm,
      stopAll,
      toggleRunning,
      updateChart,
      volumeFor,
    ],
  );

  return <BenchContext.Provider value={value}>{children}</BenchContext.Provider>;
}

export function useBench() {
  const context = useContext(BenchContext);
  if (!context) {
    throw new Error("useBench precisa estar dentro de BenchProvider");
  }
  return context;
}
