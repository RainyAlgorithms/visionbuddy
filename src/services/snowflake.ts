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
  // Mock data representing a "mapped" university library
  private mockRegistry: SpatialNode[] = [
    {
      id: "node_1",
      buildingId: "uni_library_main",
      coordinates: { x: 10, y: 20 },
      description: "Main lobby entrance. Smooth marble floor. Fountain sound at 3 o'clock.",
      isGoldenPath: true,
    },
    {
      id: "node_2",
      buildingId: "uni_library_main",
      coordinates: { x: 15, y: 45 },
      description: "Elevator bank. Braille buttons on the right side of the frame.",
      isGoldenPath: true,
    },
  ];

  async fetchGoldenPath(buildingId: string): Promise<SpatialNode[]> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 800));
    return this.mockRegistry.filter((n) => n.buildingId === buildingId);
  }

  async saveNewPath(node: Omit<SpatialNode, "id">): Promise<string> {
    console.log("Saving to Snowflake Spatial Registry:", node);
    return `node_${Math.random().toString(36).substr(2, 9)}`;
  }
}
