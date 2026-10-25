"use client";

/**
 * เรนเดอร์ LINE Flex Message JSON ให้ดูใกล้เคียงของจริง — ใช้กับ "การ์ด" ทุกแบบในระบบ
 * เพราะเซิร์ฟเวอร์คืน flex JSON ตัวเดียวกับที่จะ push จริงเป๊ะ (โหมด preview) ไม่ต้องเขียน
 * ตัวเรนเดอร์แยกทีละการ์ด แค่แปล vocabulary ของ Flex (box/text/separator/button/image) เป็น HTML
 */

type FlexNode = Record<string, unknown>;

const SIZE_PX: Record<string, string> = {
  xxs: "10px",
  xs: "11px",
  sm: "13px",
  md: "14px",
  lg: "16px",
  xl: "18px",
  xxl: "20px",
  "3xl": "24px",
  "4xl": "28px",
  "5xl": "34px",
};

function px(v: unknown, fallback: string): string {
  if (typeof v === "string") {
    if (SIZE_PX[v]) return SIZE_PX[v];
    if (/^\d+px$/.test(v)) return v;
    const n = Number(v);
    if (!Number.isNaN(n)) return `${n}px`;
  }
  return fallback;
}

function FlexText({ node }: { node: FlexNode }) {
  const align = (node.align as string) || "start";
  return (
    <p
      style={{
        margin: 0,
        fontSize: px(node.size, "13px"),
        color: (node.color as string) || "#333333",
        fontWeight: node.weight === "bold" ? 700 : 400,
        textAlign: align === "start" ? "left" : align === "end" ? "right" : "center",
        whiteSpace: node.wrap ? "pre-wrap" : "nowrap",
        overflow: node.wrap ? "visible" : "hidden",
        textOverflow: "ellipsis",
        flex: typeof node.flex === "number" ? (node.flex as number) : undefined,
        lineHeight: 1.45,
      }}
    >
      {String(node.text ?? "")}
    </p>
  );
}

function FlexButton({ node }: { node: FlexNode }) {
  const action = (node.action as FlexNode) || {};
  const label = String(action.label || "");
  const uri = typeof action.uri === "string" ? action.uri : undefined;
  const primary = node.style === "primary";
  const style: React.CSSProperties = {
    display: "block",
    textAlign: "center",
    padding: node.height === "sm" ? "8px 12px" : "11px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
    cursor: uri ? "pointer" : "default",
    background: primary ? (node.color as string) || "#4A7348" : "transparent",
    color: primary ? "#FFFFFF" : (node.color as string) || "#4A7348",
    border: primary ? "none" : `1px solid ${(node.color as string) || "#4A7348"}`,
  };
  if (uri) {
    return (
      <a href={uri} target="_blank" rel="noreferrer" style={style}>
        {label}
      </a>
    );
  }
  return <div style={style}>{label}</div>;
}

/** blockPadding = ระยะขอบของ header/body/footer — LINE จริงเว้นให้เองเมื่อการ์ดไม่ได้ตั้ง paddingAll
 *  (เมื่อก่อนไม่ได้เว้น ตัวหนังสือในตัวอย่างเลยชิดขอบการ์ด) */
function FlexBox({ node, blockPadding }: { node: FlexNode; blockPadding?: string }) {
  const layout = (node.layout as string) || "vertical";
  const contents = (node.contents as FlexNode[]) || [];
  const spacingMap: Record<string, string> = {
    none: "0",
    xs: "2px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    xxl: "20px",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: layout === "horizontal" ? "row" : layout === "baseline" ? "row" : "column",
        alignItems: layout === "baseline" ? "baseline" : layout === "horizontal" ? "center" : "stretch",
        justifyContent:
          node.justifyContent === "center"
            ? "center"
            : node.justifyContent === "flex-end"
              ? "flex-end"
              : "flex-start",
        gap: spacingMap[(node.spacing as string) || ""] || "0",
        padding: node.paddingAll ? px(node.paddingAll, "0") : blockPadding,
        backgroundColor: (node.backgroundColor as string) || undefined,
        borderRadius: node.cornerRadius ? px(node.cornerRadius, "0") : undefined,
        marginTop:
          node.margin === "sm"
            ? "4px"
            : node.margin === "md"
              ? "8px"
              : node.margin === "lg"
                ? "12px"
                : node.margin === "xl"
                  ? "16px"
                  : undefined,
        flex: typeof node.flex === "number" ? (node.flex as number) : undefined,
        minWidth: 0,
      }}
    >
      {contents.map((c, i) => (
        <FlexAny key={i} node={c} />
      ))}
    </div>
  );
}

function FlexAny({ node }: { node: FlexNode }) {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return <FlexText node={node} />;
    case "box":
      return <FlexBox node={node} />;
    case "button":
      return <FlexButton node={node} />;
    case "separator":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `1px solid ${(node.color as string) || "#EFE3D2"}`,
            width: "100%",
            margin: node.margin ? "8px 0 0" : "0",
          }}
        />
      );
    case "image":
      return (
        <img
          src={String(node.url || "")}
          alt=""
          style={{ width: "100%", borderRadius: "6px", display: "block" }}
        />
      );
    case "filler":
      return <div style={{ flex: 1 }} />;
    default:
      return null;
  }
}

function FlexBubble({ contents }: { contents: FlexNode }) {
  const header = contents.header as FlexNode | undefined;
  const hero = contents.hero as FlexNode | undefined;
  const body = contents.body as FlexNode | undefined;
  const footer = contents.footer as FlexNode | undefined;
  return (
    <div
      style={{
        width: "300px",
        maxWidth: "100%",
        borderRadius: "16px",
        overflow: "hidden",
        background: "#FFFFFF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        fontFamily:
          '"Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {header && <FlexBox node={header} blockPadding="16px 20px" />}
      {hero?.type === "image" && <FlexAny node={hero} />}
      {body && <FlexBox node={body} blockPadding="16px 20px" />}
      {footer && <FlexBox node={footer} blockPadding="10px 16px 16px" />}
    </div>
  );
}

/** การ์ด/ข้อความ 1 ชิ้น จาก messages array ที่เซิร์ฟเวอร์ส่งกลับตอน preview */
function FlexMessage({ msg }: { msg: FlexNode }) {
  if (msg.type === "text") {
    return (
      <div
        style={{
          maxWidth: "280px",
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "12px 14px",
          fontSize: "13px",
          color: "#333333",
          whiteSpace: "pre-wrap",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >
        {String(msg.text ?? "")}
      </div>
    );
  }
  if (msg.type === "flex" && msg.contents) {
    return <FlexBubble contents={msg.contents as FlexNode} />;
  }
  return null;
}

/** แสดงการ์ดหลายใบ (จากชุดการ์ด) เรียงต่อกันในแนวตั้ง เหมือนแชท LINE จริง */
export function FlexPreviewStack({ messages }: { messages: FlexNode[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-start",
        padding: "14px",
        background: "#8DB09E",
        borderRadius: "14px",
      }}
    >
      {messages.map((m, i) => (
        <FlexMessage key={i} msg={m} />
      ))}
    </div>
  );
}
