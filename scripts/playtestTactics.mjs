// Diagnostic pilot policies only: no changes to aircraft performance or launch permissions.
export const pilotStyles={
 conservative:{airSpeed:200,groundSpeed:170,bank:30,launchQuality:.8,salvo:1,shotInterval:18,reactRange:6000,cmInterval:1,returnFuel:.2,tailStandoff:3000},
 objective:{airSpeed:220,groundSpeed:185,bank:38,launchQuality:1,salvo:1,shotInterval:15,reactRange:4500,cmInterval:1.5,returnFuel:.15,tailStandoff:2200},
 aggressive:{airSpeed:260,groundSpeed:210,bank:50,launchQuality:1.1,salvo:2,shotInterval:7,reactRange:3500,cmInterval:2,returnFuel:.1,tailStandoff:1200}
};
export function pilotStyle(id){if(!pilotStyles[id])throw new Error('Unknown diagnostic pilot style: '+id);return pilotStyles[id];}
export function primaryThreat(player,targets,combat){return targets.filter(t=>t.alive&&!t.exited&&!t.pending&&!t.retreat&&t.team==='enemy'&&t.kind==='air'&&(t.aiTargetId==='PLAYER'||combat?.units.get(t.id)?.missionTargetId==='PLAYER')&&t.position.distance(player.position)<6500).sort((a,b)=>a.position.distance(player.position)-b.position.distance(player.position))[0]||null;}
export function activePlayerShots(projectiles,targetId){return projectiles.filter(p=>!p.sourceId&&['aam','agm'].includes(p.type)&&p.targetId===targetId&&!p.seekerLost&&p.decoyId===undefined&&p.age<(p.profile?.life??Infinity)).length;}
