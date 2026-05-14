import mysql from 'mysql2/promise';

const URL = 'mysql://root:BGaPDfYxAdVvTSHdlCMpdBsToliLcYuz@maglev.proxy.rlwy.net:41134/railway';

const RUNWAY_ID = 9267;
const AIRPORT_ID = 25036;

const conn = await mysql.createConnection({ uri: URL, multipleStatements: false, dateStrings: true });
try {
    const [airportCols] = await conn.query('SHOW COLUMNS FROM airports');
    console.log('--- airports columns ---');
    for (const c of airportCols) console.log(c.Field, c.Type);

    const [runwayCols] = await conn.query('SHOW COLUMNS FROM airport_runways');
    console.log('\n--- airport_runways columns ---');
    for (const c of runwayCols) console.log(c.Field, c.Type);

    const [airport] = await conn.query('SELECT * FROM airports WHERE id = ?', [AIRPORT_ID]);
    console.log('\n--- airport id =', AIRPORT_ID, '---');
    console.log(JSON.stringify(airport, null, 2));

    const [runway] = await conn.query('SELECT * FROM airport_runways WHERE id = ?', [RUNWAY_ID]);
    console.log('\n--- runway id =', RUNWAY_ID, '---');
    console.log(JSON.stringify(runway, null, 2));

    const [allLfpg] = await conn.query(
        `SELECT r.* FROM airport_runways r
         JOIN airports a ON a.id = r.airport_id
         WHERE a.icao = 'LFPG' OR a.icao_code = 'LFPG' OR a.id = ?`,
        [AIRPORT_ID],
    );
    console.log('\n--- ALL runways at LFPG (airport_id', AIRPORT_ID, ') ---');
    console.log(JSON.stringify(allLfpg, null, 2));
} finally {
    await conn.end();
}
