/** Explicit allowlist: never include save bytes, seed, receipts, account or native tokens. */
export function diagnosticSummary(s,{version='0.10.7-preview',writer=false,restoring=false,saveFailed=false,platformAllowed=true}={}){
 return {version,schema:s.schemaVersion,life:s.meta.reincarnations+1,map:s.run.mapIndex+1,checkpoint:s.run.checkpoint+1,
  activity:s.run.idle?.active?'explore':s.run.world.activity.kind,pendingBattle:!!s.run.pendingBattle,
  returnRecords:s.meta.returns.length,writer,restoring,saveFailed,platformAllowed};
}
