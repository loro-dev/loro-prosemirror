import { CSSProperties } from "react";

export const styles = {
  container: {
    display: "flex",
    flexDirection: "row" as const,
    gap: "24px",
    padding: "24px",
    backgroundColor: "#f5f5f5",
  },

  editorsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    maxHeight: "calc(100vh - 128px)",
    padding: "24px",
    overflowY: "auto",
    minWidth: "400px",
  } as const,

  editorCard: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },

  editorHeader: {
    padding: "16px",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  editorTitle: {
    margin: 0,
    color: "#2c3e50",
    fontSize: "18px",
  },

  statusButton: (isOnline: boolean): CSSProperties => ({
    backgroundColor: isOnline ? "#4CAF50" : "#f44336",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    transition: "background-color 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  }),

  editorContent: {
    padding: "16px",
  },

  historyCard: {
    backgroundColor: "white",
    borderRadius: "8px",
    padding: "20px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    minWidth: "500px",
    maxWidth: "600px",
    height: "calc(100vh - 48px)",
    overflowY: "auto",
    overflowX: "auto",
    fontFamily: "monospace",
    whiteSpace: "pre",
    fontSize: "14px",
  } as CSSProperties,

  historyTitle: {
    margin: "0 0 16px 0",
    color: "#2c3e50",
    fontSize: "18px",
    position: "sticky" as const,
    top: 0,
    backgroundColor: "white",
    padding: "8px 0",
    zIndex: 1,
  },
};
