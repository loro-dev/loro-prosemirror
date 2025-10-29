import { visualize, DagNode, Row, Thread } from "./dag-view";
import { useMemo } from "react";
import "./DagView.css";

export interface ViewDagNode extends DagNode {
  message?: string;
  author?: string;
  timestamp?: number;
}

const CELL_SIZE = 24;
const NODE_RADIUS = 5;

export function DagViewComponent({
  nodes,
  frontiers,
}: {
  nodes: ViewDagNode[];
  frontiers: string[];
}) {
  const view = useMemo(() => {
    const map = new Map<string, DagNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return visualize((id) => map.get(id), frontiers);
  }, [nodes, frontiers]);

  const rowSvgContents = view.rows.map((row, index) =>
    renderRowAsSvg(row, index, "white"),
  );

  return (
    <div style={{ position: "relative" }}>
      {rowSvgContents.map((content, index) => (
        <div
          key={`row-${index}`}
          style={{
            position: "relative",
            height: CELL_SIZE,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <svg width={content.width} height={CELL_SIZE}>
            {content.elements}
          </svg>
          <div
            className="dag-view-message"
            style={{
              fontSize: "12px",
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
            }}
          >
            <span>
              {(content.row.active.node as ViewDagNode).message ??
                content.row.active.node.id}
            </span>
            <span className="author">
              {(content.row.active.node as ViewDagNode).author}
            </span>
            <span className="timestamp">
              {(content.row.active.node as ViewDagNode).timestamp != null &&
                new Date(
                  (content.row.active.node as ViewDagNode).timestamp!,
                ).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function renderRowAsSvg(row: Row, rowIndex: number, backgroundColor: string) {
  const elements: JSX.Element[] = [];
  const y = CELL_SIZE / 2;

  // Render connections
  const inputConn = renderConnections(row, "input", y - CELL_SIZE / 2);
  const outputConn = renderConnections(row, "output", y);
  elements.push(...inputConn, ...outputConn);

  // Render nodes
  row.cur_tids.forEach((tid: number, index: number) => {
    const x = (index * CELL_SIZE) / 2 + CELL_SIZE / 4;
    const isActive = tid === row.active.tid;
    if (isActive) {
      elements.push(
        <circle
          key={`node-${rowIndex}-${index}`}
          cx={x}
          cy={y}
          r={NODE_RADIUS}
          fill={"rgb(100, 100, 230)"}
          stroke={backgroundColor}
        />,
      );
    }
  });

  const width =
    (Math.max(row.cur_tids.length, row.output.length, row.input.length) *
      CELL_SIZE) /
      2 +
    8;
  return {
    width,
    elements,
    row,
  };
}

function renderConnections(
  row: Row,
  type: "input" | "output",
  y: number,
): JSX.Element[] {
  const ans: JSX.Element[] = [];
  row[type].forEach((thread: Thread, i: number) => {
    const connectionA = row.cur_tids.indexOf(thread.tid);
    const connectionB = thread.dep_on_active ? row.active_index : -1;
    if (connectionA >= 0) {
      ans.push(renderConnection("a", type, i, connectionA, y, thread.tid));
    }
    if (connectionB >= 0) {
      ans.push(renderConnection("b", type, i, connectionB, y, thread.tid));
    }
  });

  return ans;
}

function renderConnection(
  source: "a" | "b",
  type: "input" | "output",
  xFrom: number,
  xTo: number,
  y: number,
  tid: number,
): JSX.Element {
  const startX = (xFrom * CELL_SIZE) / 2 + CELL_SIZE / 4;
  const endX = (xTo * CELL_SIZE) / 2 + CELL_SIZE / 4;
  const startY = type === "input" ? y : y + CELL_SIZE / 2;
  const endY = type === "input" ? y + CELL_SIZE / 2 : y;

  let path = "";
  // const midX = (startX + endX) / 2;
  // const midY = (startY + endY) / 2;
  if (startX > endX) {
    const controlPoint1X = startX;
    const controlPoint1Y = endY;
    const controlPoint2X = endX;
    const controlPoint2Y = startY;
    path = `M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`;
  } else {
    const controlPoint1X = startX;
    const controlPoint1Y = endY;
    const controlPoint2X = startX;
    const controlPoint2Y = endY;
    path = `M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`;
  }

  return (
    <path
      key={`connection-${source}-${type}-${tid}-${xFrom}-${xTo}`}
      d={path}
      fill="none"
      stroke={tidToColor(tid)}
      strokeWidth="2"
    />
  );
}

function tidToColor(tid: number): string {
  // Generate a beautiful color based on the thread ID
  const hue = (tid * 137.508) % 360; // Golden angle approximation for even distribution
  const saturation = 70 + (tid % 30); // Vary saturation between 70% and 100%
  const lightness = 45 + (tid % 20); // Vary lightness between 45% and 65%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
