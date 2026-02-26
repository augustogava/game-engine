/**
 * NavigationGraph - Graph-based pathfinding for vehicles.
 * 
 * Nodes represent intersections/waypoints, edges represent road connections.
 * Uses A* on the graph structure for pathfinding.
 */
import { Vector2 } from '../math/Vector2.js';

export interface NavEdge {
    targetId: number;
    cost: number;
}

export interface NavNode {
    id: number;
    position: Vector2;
    connections: NavEdge[];
}

export class NavigationGraph {
    nodes: Map<number, NavNode> = new Map();

    addNode(id: number, x: number, y: number): NavNode {
        const node: NavNode = {
            id,
            position: new Vector2(x, y),
            connections: []
        };
        this.nodes.set(id, node);
        return node;
    }

    removeNode(id: number): void {
        this.nodes.delete(id);
        for (const node of this.nodes.values()) {
            node.connections = node.connections.filter(e => e.targetId !== id);
        }
    }

    connectNodes(fromId: number, toId: number, bidirectional: boolean = true): void {
        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);

        if (!fromNode || !toNode) return;

        const cost = fromNode.position.sub(toNode.position).magnitude();

        const existingEdge = fromNode.connections.find(e => e.targetId === toId);
        if (!existingEdge) {
            fromNode.connections.push({ targetId: toId, cost });
        }

        if (bidirectional) {
            const existingReverseEdge = toNode.connections.find(e => e.targetId === fromId);
            if (!existingReverseEdge) {
                toNode.connections.push({ targetId: fromId, cost });
            }
        }
    }

    disconnectNodes(fromId: number, toId: number, bidirectional: boolean = true): void {
        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);

        if (fromNode) {
            fromNode.connections = fromNode.connections.filter(e => e.targetId !== toId);
        }

        if (bidirectional && toNode) {
            toNode.connections = toNode.connections.filter(e => e.targetId !== fromId);
        }
    }

    findPath(startId: number, endId: number): NavNode[] | null {
        const startNode = this.nodes.get(startId);
        const endNode = this.nodes.get(endId);

        if (!startNode || !endNode) return null;
        if (startId === endId) return [startNode];

        const openSet = new Map<number, { node: NavNode; g: number; f: number; parent: number | null }>();
        const closedSet = new Set<number>();

        const heuristic = (a: NavNode, b: NavNode): number => {
            return a.position.sub(b.position).magnitude();
        };

        openSet.set(startId, {
            node: startNode,
            g: 0,
            f: heuristic(startNode, endNode),
            parent: null
        });

        while (openSet.size > 0) {
            let currentId = -1;
            let lowestF = Infinity;

            for (const [id, data] of openSet) {
                if (data.f < lowestF) {
                    lowestF = data.f;
                    currentId = id;
                }
            }

            if (currentId === -1) break;

            const currentData = openSet.get(currentId)!;
            const currentNode = currentData.node;

            if (currentId === endId) {
                return this.reconstructPath(openSet, currentId);
            }

            openSet.delete(currentId);
            closedSet.add(currentId);

            for (const edge of currentNode.connections) {
                if (closedSet.has(edge.targetId)) continue;

                const neighborNode = this.nodes.get(edge.targetId);
                if (!neighborNode) continue;

                const tentativeG = currentData.g + edge.cost;

                const existingData = openSet.get(edge.targetId);

                if (!existingData || tentativeG < existingData.g) {
                    openSet.set(edge.targetId, {
                        node: neighborNode,
                        g: tentativeG,
                        f: tentativeG + heuristic(neighborNode, endNode),
                        parent: currentId
                    });
                }
            }
        }

        return null;
    }

    private reconstructPath(
        openSet: Map<number, { node: NavNode; g: number; f: number; parent: number | null }>,
        endId: number
    ): NavNode[] {
        const path: NavNode[] = [];
        let currentId: number | null = endId;

        const allData = new Map(openSet);

        while (currentId !== null) {
            const data = allData.get(currentId);
            if (!data) {
                const node = this.nodes.get(currentId);
                if (node) path.unshift(node);
                break;
            }
            path.unshift(data.node);
            currentId = data.parent;
        }

        return path;
    }

    getNearestNode(position: Vector2): NavNode | null {
        let nearest: NavNode | null = null;
        let minDist = Infinity;

        for (const node of this.nodes.values()) {
            const dist = position.sub(node.position).magnitudeSq();
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        }

        return nearest;
    }

    getRandomNode(): NavNode | null {
        const nodesArray = Array.from(this.nodes.values());
        if (nodesArray.length === 0) return null;
        return nodesArray[Math.floor(Math.random() * nodesArray.length)];
    }

    getNodeCount(): number {
        return this.nodes.size;
    }

    clear(): void {
        this.nodes.clear();
    }
}
