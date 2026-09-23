/// <reference types="vite/client" />

declare module "*.png" {
  const src: string;
  export default src;
}

type ComPortInfo = {
  path: string;
  label: string;
};

type HiddenUserInfo = {
  id: number;
  slug: string;
  displayName: string;
  hidden: boolean;
};

type StoreSnapshotInfo = {
  user: HiddenUserInfo;
  calibrations: unknown;
  recipes: unknown;
  charts: unknown;
  experiments: unknown;
  preferences?: unknown;
  migratedFromLocal: boolean;
};

type DesktopStoreApi = {
  currentUser: () => Promise<HiddenUserInfo>;
  load: () => Promise<StoreSnapshotInfo>;
  saveCalibrations: (calibrations: unknown) => Promise<StoreSnapshotInfo>;
  saveRecipes: (recipes: unknown) => Promise<StoreSnapshotInfo>;
  saveCharts: (layouts: unknown) => Promise<StoreSnapshotInfo>;
  saveExperiments: (programs: unknown) => Promise<StoreSnapshotInfo>;
  importLocal: (snapshot: unknown) => Promise<StoreSnapshotInfo>;
  savePreferences: (preferences: unknown) => Promise<StoreSnapshotInfo>;
};

type DesktopSerialApi = {
  listPorts: () => Promise<ComPortInfo[]>;
  connect: (portPath: string) => Promise<void>;
  disconnect: () => Promise<void>;
  write: (line: string) => Promise<void>;
  onData: (handler: (line: string) => void) => () => void;
  onClosed: (handler: (reason: string) => void) => () => void;
  store?: DesktopStoreApi;
};

interface Window {
  bomba?: DesktopSerialApi;
}
