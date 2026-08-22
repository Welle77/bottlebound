export interface RulesUiState {
  readonly version: string;
  open: boolean;
  query: string;
  selectedAnchor: string | null;
  scrollTop: number;
  openerId: string | null;
}

export function createRulesUiState(version: string): RulesUiState {
  return {
    version,
    open: false,
    query: "",
    selectedAnchor: null,
    scrollTop: 0,
    openerId: null,
  };
}

export function retainRulesVersion(
  state: RulesUiState,
  version: string,
): RulesUiState {
  return state.version === version ? state : createRulesUiState(version);
}
