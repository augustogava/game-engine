import mysql from 'mysql2/promise';

const URL = 'mysql://root:BGaPDfYxAdVvTSHdlCMpdBsToliLcYuz@maglev.proxy.rlwy.net:41134/railway';

const RUNWAY_ID = 9267;
const AIRPORT_ID = 25036;
const TARGET_ELEVATION_FT = 392;

const conn = await mysql.createConnection({ uri: URL, dateStrings: true });
try {
    await conn.beginTransaction();

    const [airportRows] = await conn.query(
        'SELECT id, icao_code, elevation_ft FROM airports WHERE id = ? FOR UPDATE',
        [AIRPORT_ID],
    );
    if (!airportRows.length) {
        throw new Error(`Airport id ${AIRPORT_ID} not found`);
    }
    const airport = airportRows[0];
    if (Number(airport.elevation_ft) !== TARGET_ELEVATION_FT) {
        throw new Error(
            `Airport elevation mismatch: expected ${TARGET_ELEVATION_FT}, got ${airport.elevation_ft}`,
        );
    }

    const [before] = await conn.query(
        'SELECT id, airport_id, le_ident, le_elevation_ft, he_ident, he_elevation_ft FROM airport_runways WHERE id = ? FOR UPDATE',
        [RUNWAY_ID],
    );
    if (!before.length) {
        throw new Error(`Runway id ${RUNWAY_ID} not found`);
    }
    if (before[0].airport_id !== AIRPORT_ID) {
        throw new Error(
            `Runway ${RUNWAY_ID} belongs to airport ${before[0].airport_id}, not ${AIRPORT_ID}`,
        );
    }

    console.log('BEFORE:', JSON.stringify(before[0], null, 2));

    const [result] = await conn.query(
        'UPDATE airport_runways SET le_elevation_ft = ?, he_elevation_ft = ? WHERE id = ? AND airport_id = ?',
        [TARGET_ELEVATION_FT, TARGET_ELEVATION_FT, RUNWAY_ID, AIRPORT_ID],
    );
    console.log('Rows affected:', result.affectedRows);

    const [after] = await conn.query(
        'SELECT id, airport_id, le_ident, le_elevation_ft, he_ident, he_elevation_ft FROM airport_runways WHERE id = ?',
        [RUNWAY_ID],
    );
    console.log('AFTER:', JSON.stringify(after[0], null, 2));

    await conn.commit();
    console.log('OK: committed');
} catch (err) {
    await conn.rollback();
    console.error('ERROR (rolled back):', err.message);
    process.exitCode = 1;
} finally {
    await conn.end();
}
