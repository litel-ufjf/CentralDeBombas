import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ExperimentModal } from "../components/ExperimentModal";
import { ProgramDock } from "../components/ProgramDock";
import { isOwnedState } from "../lib/protocol";
import { useBench } from "./BenchContext";

type ExperimentWindowValue = {
  openId: number | null;
  minimized: boolean;
  openExperiment: (id: number) => void;
  minimizeExperiment: () => void;
  closeExperiment: () => void;
};

const ExperimentWindowContext = createContext<ExperimentWindowValue | null>(null);

export function ExperimentWindowProvider({ children }: { children: ReactNode }) {
  const { pumps, programs } = useBench();
  const [openId, setOpenId] = useState<number | null>(null);
  const [minimized, setMinimized] = useState(false);

  const openExperiment = useCallback((id: number) => {
    setOpenId(id);
    setMinimized(false);
  }, []);
  const minimizeExperiment = useCallback(() => setMinimized(true), []);
  const closeExperiment = useCallback(() => {
    setOpenId(null);
    setMinimized(false);
  }, []);

  const activeOpen = openId !== null && isOwnedState(programs[openId - 1]?.state ?? "empty");
  const requestClose = useCallback(() => {
    if (activeOpen) {
      setMinimized(true);
    } else {
      closeExperiment();
    }
  }, [activeOpen, closeExperiment]);

  const value = useMemo(
    () => ({ openId, minimized, openExperiment, minimizeExperiment, closeExperiment }),
    [closeExperiment, minimizeExperiment, minimized, openExperiment, openId],
  );
  const pump = openId !== null ? pumps.find((item) => item.id === openId) : undefined;

  return (
    <ExperimentWindowContext.Provider value={value}>
      {children}
      {pump ? (
        <ExperimentModal
          key={pump.id}
          pumpId={pump.id}
          pumpName={pump.name}
          minimized={minimized}
          onMinimize={minimizeExperiment}
          onClose={requestClose}
        />
      ) : null}
      <ProgramDock
        editorId={openId}
        editorMinimized={minimized}
        onOpen={openExperiment}
        onCloseEditor={closeExperiment}
      />
    </ExperimentWindowContext.Provider>
  );
}

export function useExperimentWindow() {
  const context = useContext(ExperimentWindowContext);
  if (!context) {
    throw new Error("useExperimentWindow precisa estar dentro de ExperimentWindowProvider");
  }
  return context;
}
