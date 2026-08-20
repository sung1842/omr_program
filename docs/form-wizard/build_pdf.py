"""Build docs/form-wizard/architecture.pdf from architecture.md (Korean)."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
MD = ROOT / "architecture.md"
PDF = ROOT / "architecture.pdf"
FONT = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")


def register_fonts() -> tuple[str, str]:
    regular = "Malgun"
    bold = "Malgun-Bold"
    pdfmetrics.registerFont(TTFont(regular, str(FONT)))
    if FONT_BOLD.exists():
        pdfmetrics.registerFont(TTFont(bold, str(FONT_BOLD)))
    else:
        bold = regular
    return regular, bold


def styles_for(regular: str, bold: str) -> dict[str, ParagraphStyle]:
    ink = HexColor("#111111")
    muted = HexColor("#444444")
    line = HexColor("#D0D0D0")
    base = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle(
            "cover",
            parent=base["Title"],
            fontName=bold,
            fontSize=18,
            leading=24,
            textColor=ink,
            spaceAfter=8,
        ),
        "sub": ParagraphStyle(
            "sub",
            parent=base["Normal"],
            fontName=regular,
            fontSize=10,
            leading=15,
            textColor=muted,
            spaceAfter=14,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName=bold,
            fontSize=13,
            leading=18,
            textColor=ink,
            spaceBefore=16,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName=bold,
            fontSize=11,
            leading=16,
            textColor=ink,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName=regular,
            fontSize=9.5,
            leading=15,
            textColor=ink,
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        ),
        "code": ParagraphStyle(
            "code",
            parent=base["Code"],
            fontName=regular,
            fontSize=8,
            leading=12,
            textColor=ink,
            backColor=HexColor("#F4F4F4"),
            leftIndent=6,
            rightIndent=6,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base["Normal"],
            fontName=regular,
            fontSize=8,
            leading=12,
            textColor=ink,
            alignment=TA_LEFT,
        ),
        "cellh": ParagraphStyle(
            "cellh",
            parent=base["Normal"],
            fontName=bold,
            fontSize=8,
            leading=12,
            textColor=ink,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName=regular,
            fontSize=9.5,
            leading=14,
            textColor=ink,
            leftIndent=12,
            spaceAfter=2,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName=regular,
            fontSize=8,
            textColor=muted,
        ),
        "line": line,
    }


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("`", "")
    )


def parse_table(lines: list[str], cell: ParagraphStyle, cellh: ParagraphStyle) -> Table:
    rows: list[list[Paragraph]] = []
    for index, raw in enumerate(lines):
        cols = [c.strip() for c in raw.strip().strip("|").split("|")]
        if index == 1 and all(set(c) <= set("-: ") for c in cols):
            continue
        style = cellh if index == 0 else cell
        rows.append([Paragraph(esc(c), style) for c in cols])
    table = Table(rows, hAlign="LEFT", colWidths=None)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F0F0F0")),
                ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#C8C8C8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def build_story(md: str, s: dict[str, ParagraphStyle]) -> list:
    story: list = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    in_code = False
    code_buf: list[str] = []
    table_buf: list[str] = []

    def flush_table() -> None:
        if table_buf:
            story.append(parse_table(table_buf, s["cell"], s["cellh"]))
            story.append(Spacer(1, 6))
            table_buf.clear()

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush_table()
            if in_code:
                story.append(Preformatted("\n".join(code_buf), s["code"]))
                code_buf.clear()
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue
        if line.strip().startswith("|"):
            table_buf.append(line)
            i += 1
            continue
        flush_table()
        if line.startswith("# "):
            story.append(Paragraph(esc(line[2:]), s["cover"]))
        elif line.startswith("## "):
            story.append(Paragraph(esc(line[3:]), s["h1"]))
        elif line.startswith("### "):
            story.append(Paragraph(esc(line[4:]), s["h2"]))
        elif line.startswith("- "):
            story.append(Paragraph("• " + esc(line[2:]), s["bullet"]))
        elif line.strip() == "":
            story.append(Spacer(1, 4))
        else:
            story.append(Paragraph(esc(line), s["body"] if story else s["sub"]))
        i += 1
    flush_table()
    return story


def footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(HexColor("#666666"))
    canvas.setFont("Malgun", 8)
    canvas.drawString(18 * mm, 12 * mm, "양식 등록 마법사 설계 · 구현 전 문서")
    canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, str(doc.page))
    canvas.restoreState()


def main() -> None:
    regular, bold = register_fonts()
    styles = styles_for(regular, bold)
    md = MD.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(PDF),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="양식 등록 마법사 설계",
        author="omr",
    )
    doc.build(build_story(md, styles), onFirstPage=footer, onLaterPages=footer)
    print(PDF)


if __name__ == "__main__":
    main()
