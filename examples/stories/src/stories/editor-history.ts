import type { ViewDagNode } from "./DagView";
import type { 
    LoroDoc,
    OpId,
    Change
} from "loro-crdt";

// Persistently stored operation records
interface StoredOperation {
    id: string;  // opId string
    deps: string[];
    lamport: number;
    message: string;
    author: string;
    timestamp: number;
}

const storedOperations: StoredOperation[] = [];

export function convertSyncStepsToNodes(
    doc: LoroDoc
): { nodes: ViewDagNode[]; frontiers: string[] } {
    const changes = doc.getAllChanges();
    const visited = new Set<string>();
    
    // Update persistent storage
    changes.forEach((peerChanges) => {
        peerChanges.forEach((change) => {
            const opId = idToString({ 
                peer: change.peer, 
                counter: change.counter + change.length - 1 
            });

            // If the operation has not already been stored
            if (!storedOperations.some(op => op.id === opId)) {
                storedOperations.push({
                    id: opId,
                    deps: change.deps.map(dep => idToString(dep)),
                    lamport: change.lamport + change.length - 1,
                    message: formatChangeMessage(change),
                    author: change.peer,
                    timestamp: change.timestamp ? change.timestamp * 1000 : Date.now(),
                });
            }
        });
    });

    console.log('Stored Operations:', storedOperations);

    const frontiers = doc.oplogFrontiers().map(f => 
        idToString({
            peer: f.peer,
            counter: f.counter
        })
    );

    // Build an ordered list of nodes using DFS
    const nodes: ViewDagNode[] = [];
    const nodeMap = new Map<string, StoredOperation>();
    storedOperations.forEach(op => nodeMap.set(op.id, op));

    function dfs(opId: string) {
        if (visited.has(opId)) return;
        visited.add(opId);

        const operation = nodeMap.get(opId);
        if (!operation) return;

        operation.deps.forEach(depId => {
            dfs(depId);
        });

        nodes.push({
            id: operation.id,
            deps: operation.deps,
            lamport: operation.lamport,
            message: operation.message,
            author: operation.author,
            timestamp: operation.timestamp
        });
    }

    frontiers.forEach(frontier => {
        dfs(frontier);
    });

    return { nodes, frontiers };
}

function formatChangeMessage(change: Change): string {
    if (change.message) {
        return change.message;
    }
    return `Change at ${change.counter} (length: ${change.length})`;
}

export function idToString(id: OpId): string {
    return `${id.counter}@${id.peer}`;
}