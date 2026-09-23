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
import { commands, createEmptyState, parseLine } from "../lib/protocol";
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
  type DisplayPreferences,
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

type PumpTelemetry = {
  monitoring: boolean;
  volume: number;
  lastT: number;
  samples: TelemetrySample[];
};

function emptyTelemetry(): PumpTelemetry[] {
  return Array.from({ length: MOTOR_COUNT }, () => ({
    monitoring: false,
    volume: 0,
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
  const [telemetry, setTelemetry] = useState(() =>
    loadChartLayouts().map((list) => ({
      monitoring: list.length > 0,
      volume: 0,
      lastT: 0,
      samples: [] as TelemetrySample[],
    })),
  );
  const [globalPwm, setGlobalPwmState] = useState(0);
  const [knownPorts, setKnownPorts] = useState<ComPort[]>([]);

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
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        try {
          await client.write(commands.stopAll());
        } catch {
          /* porta já pode ter caído */
        }
        await client.disconnect();
      }
      setConnected(false);
      setConnecting(false);
      setSetpoints(createDefaultSetpoints());
      setGlobalPwmState(0);
      if (reason) {
        setError(reason);
      }
    },
    [clearHeartbeat],
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
            helloWaitRef.current?.(true);
            helloWaitRef.current = null;
            return;
          }
          if (line.kind === "error") {
            setError(line.message);
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
        await client.write(commands.get());
        heartbeatRef.current = window.setInterval(() => {
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
    [dropConnection, refreshPorts, send],
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
      const next = clampPwm(pwm);
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, pwm: next } : pump,
        ),
      );
      queuePwm(id, next);
    },
    [queuePwm],
  );

  const setDirection = useCallback(
    (id: number, direction: PumpDirection) => {
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, direction } : pump,
        ),
      );
      void send(commands.direction(id, direction));
    },
    [send],
  );

  const setEnabled = useCallback(
    (id: number, enabled: boolean) => {
      setSetpoints((current) =>
        current.map((pump, index) =>
          index === id - 1 ? { ...pump, enabled } : pump,
        ),
      );
      void send(commands.enable(id, enabled));
    },
    [send],
  );

  const toggleRunning = useCallback(
    (id: number) => {
      const current = setpoints[id - 1];
      if (!current) {
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
    [calibrations, preferences, send, setpoints],
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
          ? { ...item, volume: 0, lastT: 0, samples: [] }
          : item,
      ),
    );
  }, []);

  const chartsFor = useCallback((id: number) => charts[id - 1] ?? [], [charts]);
  const samplesFor = useCallback(
    (id: number) => telemetry[id - 1]?.samples ?? [],
    [telemetry],
  );
  const volumeFor = useCallback(
    (id: number) => telemetry[id - 1]?.volume ?? 0,
    [telemetry],
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
        current.map((pump) => ({
          ...pump,
          pwm: next,
          enabled: next > 0 || pump.enabled,
        })),
      );
      for (let id = 1; id <= MOTOR_COUNT; id++) {
        void send(commands.pwm(id, next));
        if (next > 0) {
          void send(commands.enable(id, true));
        }
      }
    },
    [send],
  );

  const stopAll = useCallback(() => {
    setSetpoints((current) =>
      current.map((pump) => ({ ...pump, enabled: false, pwm: 0 })),
    );
    setGlobalPwmState(0);
    void send(commands.stopAll());
  }, [send]);

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
          const flow = running
            ? Math.max(0, flowFromPwm(setpoint.pwm, calibration))
            : 0;
          const dt = item.lastT > 0 ? Math.min(1000, now - item.lastT) : 0;
          const volume = item.volume + flow * (dt / 60000);
          const samples = [
            ...item.samples,
            { t: now, flow, volume },
          ].slice(-7200);
          return { ...item, lastT: now, volume, samples };
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
