/**
 * Simulated Snowflake Spatial Registry
 * In production, this would use the Snowflake SQL API to fetch vector data.
 */

export interface SpatialNode {
  id: string;
  buildingId: string;
  coordinates: { x: number; y: number };
  description: string;
  isGoldenPath: boolean;
}

export class SnowflakeService {
  async searchRegistry(query: string, buildingId: string): Promise<SpatialNode[]> {
    const sql = `SELECT ID, BUILDING_ID, COORDINATES, DESCRIPTION, IS_GOLDEN_PATH 
                 FROM SPATIAL_REGISTRY 
                 WHERE BUILDING_ID = '${buildingId}' 
                 AND (LOWER(DESCRIPTION) LIKE '%${query.toLowerCase()}%')`;
    
    try {
      const response = await fetch("/api/snowflake/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      });
      
      const data = await response.json();
      if (data.data) {
        return data.data.map((row: any[]) => ({
          id: row[0],
          buildingId: row[1],
          coordinates: JSON.parse(row[2]),
          description: row[3],
          isGoldenPath: row[4] === "TRUE" || row[4] === true
        }));
      }
      return [];
    } catch (error) {
      console.error("Snowflake Search Error:", error);
      return [];
    }
  }

  async fetchGoldenPath(buildingId: string): Promise<SpatialNode[]> {
    const sql = `SELECT ID, BUILDING_ID, COORDINATES, DESCRIPTION, IS_GOLDEN_PATH 
                 FROM SPATIAL_REGISTRY 
                 WHERE BUILDING_ID = '${buildingId}' AND IS_GOLDEN_PATH = TRUE`;
    
    try {
      const response = await fetch("/api/snowflake/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      });
      
      const data = await response.json();
      
      // Map Snowflake response format to SpatialNode[]
      if (data.data) {
        return data.data.map((row: any[]) => ({
          id: row[0],
          buildingId: row[1],
          coordinates: JSON.parse(row[2]),
          description: row[3],
          isGoldenPath: row[4] === "TRUE" || row[4] === true
        }));
      }
      return [];
    } catch (error) {
      console.error("Snowflake Fetch Error:", error);
      return [];
    }
  }

  async saveNewPath(node: Omit<SpatialNode, "id">): Promise<string> {
    const id = `node_${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure table exists first (Ghostwriter auto-setup)
    const createTableSql = `CREATE TABLE IF NOT EXISTS SPATIAL_REGISTRY (
      ID STRING,
      BUILDING_ID STRING,
      COORDINATES STRING,
      DESCRIPTION STRING,
      IS_GOLDEN_PATH BOOLEAN
    )`;

    const insertSql = `INSERT INTO SPATIAL_REGISTRY (ID, BUILDING_ID, COORDINATES, DESCRIPTION, IS_GOLDEN_PATH)
                 VALUES ('${id}', '${node.buildingId}', '${JSON.stringify(node.coordinates)}', '${node.description.replace(/'/g, "''")}', ${node.isGoldenPath})`;
    
    try {
      // 1. Ensure table exists
      await fetch("/api/snowflake/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: createTableSql })
      });

      // 2. Insert data
      const response = await fetch("/api/snowflake/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: insertSql })
      });
      
      const data = await response.json();
      if (data.code === "000000") {
        return id;
      }
      
      const errorMsg = data.message || data.error || "Unknown Snowflake error";
      const hint = data.hint ? `\nHint: ${data.hint}` : "";
      const detail = data.detail ? `\nDetail: ${data.detail}` : "";
      console.error("Snowflake Save Error Detail:", data);
      throw new Error(`Snowflake Save Failed: ${errorMsg}${hint}${detail}`);
    } catch (error: any) {
      console.error("Snowflake Save Error:", error);
      throw error;
    }
  }
}
