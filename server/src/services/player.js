import { randomUUID } from 'node:crypto';
import { fail, key, playerTransaction, transaction, ledger } from './transaction.js';
import { requireActiveSession } from './sessions.js';

export async function missions(db, playerId) {
  return (await db.query(`SELECT m.*,c.transaction_id IS NOT NULL AS claimed,CASE WHEN m.metric='catch' THEN
    (SELECT count(*) FROM catch_receipts WHERE player_id=$1) ELSE
    (SELECT count(DISTINCT s.species_id) FROM conservation_events e JOIN conservation_subjects s ON s.id=e.subject_id WHERE e.player_id=$1 AND e.activity=m.metric) END AS progress
    FROM mission_definitions m LEFT JOIN mission_claims c ON c.mission_id=m.id AND c.player_id=$1 ORDER BY m.id`, [playerId])).rows;
}
export async function upgrade(db, identity, idempotencyKey) {
  return playerTransaction(db, identity,idempotencyKey,async(c,scoped)=>{
    const equipment=(await c.query('SELECT * FROM player_equipment WHERE player_id=$1 FOR UPDATE',[identity.id])).rows[0];
    const level=equipment.speargun_level+1; if(level>3) fail('equipment_max_level');
    const cost=level===2?100:300;
    if(!(await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance >= $2',[identity.id,cost])).rowCount) fail('insufficient_credits');
    await c.query("UPDATE game_treasury SET balance=balance+$1,version=version+1 WHERE id='main'",[cost]);
    await c.query('UPDATE player_equipment SET speargun_level=$2,version=version+1 WHERE player_id=$1',[identity.id,level]);
    const result={speargunLevel:level,cost};
    const id=await ledger(c,{playerId:identity.id,key:scoped,kind:'equipment_upgrade',amount:cost,reference:`speargun:${level}`,from:['player',identity.id],to:['game','main'],result});
    return {transactionId:id,...result};
  });
}
export async function claim(db, identity, missionId, idempotencyKey) {
  return playerTransaction(db,identity,idempotencyKey,async(c,scoped)=>{
    const mission=(await missions(c,identity.id)).find(m=>m.id===missionId);
    if(!mission) fail('mission_not_found',404);
    if(mission.claimed) fail('mission_already_claimed');
    if(Number(mission.progress)<mission.goal) fail('mission_incomplete');
    if(!(await c.query("UPDATE game_treasury SET balance=balance-$1,version=version+1 WHERE id='main' AND balance >= $1",[mission.reward])).rowCount) fail('reward_budget_exhausted');
    await c.query('UPDATE player_accounts SET balance=balance+$2,version=version+1 WHERE player_id=$1',[identity.id,mission.reward]);
    const id=await ledger(c,{playerId:identity.id,key:scoped,kind:'mission_reward',amount:mission.reward,reference:missionId,from:['game','main'],to:['player',identity.id]});
    await c.query('INSERT INTO mission_claims VALUES($1,$2,$3)',[identity.id,missionId,id]);
    return {transactionId:id,reward:mission.reward};
  });
}
export async function unlockZone(db,identity,zoneId,idempotencyKey) {
  return playerTransaction(db,identity,idempotencyKey,async(c,scoped)=>{
    const z=(await c.query('SELECT * FROM zone_definitions WHERE id=$1',[zoneId])).rows[0];
    if(!z) fail('zone_not_found',404);
    if(z.id==='reef'||(await c.query('SELECT 1 FROM player_zones WHERE player_id=$1 AND zone_id=$2',[identity.id,zoneId])).rowCount) fail('zone_already_unlocked');
    const level=(await c.query('SELECT speargun_level FROM player_equipment WHERE player_id=$1 FOR SHARE',[identity.id])).rows[0].speargun_level;
    if(level<z.required_level) fail('equipment_insufficient',403);
    if(!(await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance >= $2',[identity.id,z.cost])).rowCount) fail('insufficient_credits');
    await c.query("UPDATE game_treasury SET balance=balance+$1,version=version+1 WHERE id='main'",[z.cost]);
    await c.query('INSERT INTO player_zones VALUES($1,$2)',[identity.id,zoneId]);
    const id=await ledger(c,{playerId:identity.id,key:scoped,kind:'zone_unlock',amount:z.cost,reference:zoneId,from:['player',identity.id],to:['game','main']});
    return {transactionId:id,zoneId};
  });
}
export async function conservation(db,identity,body,idempotencyKey) {
  key(idempotencyKey);
  return transaction(db,async c=>{
    await requireActiveSession(c,identity);
    await c.query('SELECT player_id FROM player_accounts WHERE player_id=$1 FOR UPDATE',[identity.id]);
    const s=(await c.query('SELECT * FROM conservation_subjects WHERE id=$1 FOR SHARE',[body.subjectId])).rows[0];
    if(!s||!s.protected) fail('subject_not_found',404);
    if(body.activity==='release'&&!s.can_release) fail('subject_not_trapped');
    if((await c.query('SELECT 1 FROM conservation_events WHERE player_id=$1 AND (idempotency_key=$2 OR (subject_id=$3 AND activity=$4))',[identity.id,idempotencyKey,s.id,body.activity])).rowCount) fail('activity_already_recorded');
    if((await c.query("SELECT 1 FROM conservation_events WHERE player_id=$1 AND created_at>clock_timestamp()-interval '2 seconds'",[identity.id])).rowCount) fail('activity_rate_limited',429);
    await requireActiveSession(c,identity);
    const id=randomUUID();
    await c.query('INSERT INTO conservation_events(id,player_id,subject_id,activity,idempotency_key) VALUES($1,$2,$3,$4,$5)',[id,identity.id,s.id,body.activity,idempotencyKey]);
    if(body.activity==='release') {
      await c.query('UPDATE habitats SET health_ppm=LEAST(1000000,health_ppm+1000),version=version+1,updated_at=clock_timestamp() WHERE id=$1',[s.habitat_id]);
    }
    return {id,trustTier:'client_simulated_validated'};
  });
}
