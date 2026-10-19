// SI gameplay approximations, not certified performance charts. Propeller types
// use equivalent installed thrust in the existing simplified force model.
const common={hasAB:false,cd0:.026,inducedDrag:.045,clSlope:5.2,maxCL:1.7,stallAlpha:19*Math.PI/180,pitchRate:12,rollRate:25,radarRange:0,radarCone:60,lockTime:2,gunAmmo:0,tags:[],shape:'straight',approachSpeed:65};
// B-52 uses a historical armed configuration. Turret arcs/stocks are gameplay
// approximations, not certified charts; the modern B-52 no longer carries a gun.
export const aiAircraft=[
 {id:'c130',name:'C-130 Hercules',faction:'west',role:'Szállító',emptyMass:34400,fuelCapacity:20000,wingArea:162.1,engineCount:4,thrust:180000,maxG:2.5,maxMach:.65,ceiling:10000},
 {id:'il76',name:'Il-76 Candid',faction:'east',role:'Szállító',emptyMass:92000,fuelCapacity:100000,wingArea:300,engineCount:4,thrust:470000,maxG:2.5,maxMach:.82,ceiling:13000},
 {id:'b52',radarRange:60000,defensiveGun:{profile:'m61',rounds:1800,aftHalfAngle:65*Math.PI/180,offset:[0,0,-24]},name:'B-52 Stratofortress',faction:'west',role:'Bombázó',emptyMass:83250,fuelCapacity:141610,wingArea:371.6,engineCount:8,thrust:605000,maxG:2.5,maxMach:.86,ceiling:15000},
 {id:'tu95',radarRange:60000,defensiveGun:{profile:'gsh23',rounds:1800,aftHalfAngle:65*Math.PI/180,offset:[0,0,-23]},name:'Tu-95 Bear',faction:'east',role:'Bombázó',emptyMass:90000,fuelCapacity:84000,wingArea:283.7,engineCount:4,thrust:480000,maxG:2.5,maxMach:.83,ceiling:13000},
 {id:'airliner',name:'Civil utasszállító',faction:'neutral',role:'Civil',emptyMass:41000,fuelCapacity:20000,wingArea:125,engineCount:2,thrust:220000,maxG:2.5,maxMach:.82,ceiling:12500}
].map(spec=>({...common,...spec,abThrust:spec.thrust}));
