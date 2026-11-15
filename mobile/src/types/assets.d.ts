// Static text-asset modules (Metro asset ids): the Blockly UMD bundles
// under assets/blockly/ are imported as modules and resolved to numeric
// asset ids by Metro — `Asset.fromModule(id)` loads their bytes.
declare module '*.txt' {
  const assetModule: number;
  export default assetModule;
}
