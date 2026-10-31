from datetime import datetime
from decimal import Decimal
import io
import logging
import os
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings
from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice

logger = logging.getLogger("billsync.pdf")


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas that accumulates total page count and stamps
    professional page numbering ('Page X of Y') and footer notes
    consistently on every page.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Footer divider line
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(36, 42, self._pagesize[0] - 36, 42)

        # Footer Left: Legal / compliance note
        self.drawString(
            36,
            26,
            "BillSync Automated Billing System • Valid without physical signature • Generated via API"
        )

        # Footer Right: Page counter
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(self._pagesize[0] - 36, 26, page_str)
        self.restoreState()


class InvoicePDFService:
    """
    Dedicated PDF generation service for BillSync invoices.
    Renders high-fidelity, professional financial PDF documents.
    Strictly reads persisted invoice values without altering or recalculating them.
    """

    @classmethod
    def generate_pdf(cls, invoice: Invoice, logo_path: Optional[str] = None) -> bytes:
        """
        Renders a complete, downloadable PDF invoice in memory and returns the raw bytes.
        """
        buffer = io.BytesIO()

        # Target printable width: 612 - 72 = 540 pt
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=54,  # Reserve room for custom footer
        )

        styles = getSampleStyleSheet()

        # Brand & Typography Styles
        brand_title = ParagraphStyle(
            "BrandTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#0F172A"),
        )
        brand_sub = ParagraphStyle(
            "BrandSub",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#64748B"),
        )
        inv_title = ParagraphStyle(
            "InvTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=2,  # Right
            textColor=colors.HexColor("#1E293B"),
        )
        inv_number_style = ParagraphStyle(
            "InvNumber",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            alignment=2,
            textColor=colors.HexColor("#2563EB"),
        )
        section_heading = ParagraphStyle(
            "SectionHeading",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#64748B"),
        )
        body_bold = ParagraphStyle(
            "BodyBold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#0F172A"),
        )
        body_text = ParagraphStyle(
            "BodyText",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#334155"),
        )
        tbl_hdr_left = ParagraphStyle(
            "TblHdrLeft",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
        )
        tbl_hdr_right = ParagraphStyle(
            "TblHdrRight",
            parent=tbl_hdr_left,
            alignment=2,
        )
        tbl_cell_left = ParagraphStyle(
            "TblCellLeft",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1E293B"),
        )
        tbl_cell_right = ParagraphStyle(
            "TblCellRight",
            parent=tbl_cell_left,
            alignment=2,
        )
        summary_lbl = ParagraphStyle(
            "SummaryLbl",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            alignment=2,
            textColor=colors.HexColor("#475569"),
        )
        summary_val = ParagraphStyle(
            "SummaryVal",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            alignment=2,
            textColor=colors.HexColor("#0F172A"),
        )

        elements = []

        # ---------------------------------------------------------
        # 1. HEADER SECTION (Brand & Invoice Metadata)
        # ---------------------------------------------------------
        effective_logo = logo_path or settings.LOGO_PATH
        if effective_logo and os.path.exists(effective_logo):
            try:
                logo_elem = Image(effective_logo, width=120, height=36)
                brand_elem = logo_elem
            except Exception as exc:
                logger.warning("Could not load logo image from %s: %s", effective_logo, exc)
                brand_elem = Paragraph("<b>BILLSYNC</b>", brand_title)
        else:
            brand_elem = [
                Paragraph("BILLSYNC", brand_title),
                Paragraph("Subscription Management & Finance", brand_sub),
            ]

        # Status badge styling
        status_colors = {
            InvoiceStatus.PAID: ("#DCFCE7", "#15803D"),
            InvoiceStatus.PARTIALLY_PAID: ("#FEF3C7", "#B45309"),
            InvoiceStatus.CONFIRMED: ("#DBEAFE", "#1D4ED8"),
            InvoiceStatus.DRAFT: ("#F1F5F9", "#475569"),
            InvoiceStatus.OVERDUE: ("#FEE2E2", "#B91C1C"),
            InvoiceStatus.CANCELLED: ("#F3F4F6", "#6B7280"),
        }
        bg_col, txt_col = status_colors.get(invoice.status, ("#E2E8F0", "#334155"))
        status_label = invoice.status.value.replace("_", " ").upper()
        status_style = ParagraphStyle(
            "StatusStyle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            alignment=1,  # Center
            textColor=colors.HexColor(txt_col),
        )
        badge_table = Table(
            [[Paragraph(status_label, status_style)]],
            colWidths=[90],
            rowHeights=[16]
        )
        badge_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg_col)),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))

        header_table = Table(
            [
                [
                    brand_elem,
                    [
                        Paragraph("INVOICE", inv_title),
                        Spacer(1, 2),
                        Paragraph(f"#{xml_escape(invoice.invoice_number)}", inv_number_style),
                        Spacer(1, 4),
                        badge_table
                    ]
                ]
            ],
            colWidths=[300, 240]
        )
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 14))

        # Thin divider
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E2E8F0"), spaceAfter=14))

        # ---------------------------------------------------------
        # 2. CUSTOMER "BILL TO" & INVOICE DETAILS GRID
        # ---------------------------------------------------------
        cust = invoice.customer
        cust_name = xml_escape(cust.name) if cust and cust.name else "N/A"
        cust_email = xml_escape(cust.email) if cust and cust.email else None
        cust_phone = xml_escape(cust.phone) if cust and cust.phone else None
        cust_address = cust.billing_address if cust and cust.billing_address else None

        bill_to_paragraphs = [
            Paragraph("BILLED TO", section_heading),
            Spacer(1, 3),
            Paragraph(cust_name, body_bold),
        ]
        if cust_address:
            formatted_addr = "<br/>".join(xml_escape(line.strip()) for line in cust_address.strip().splitlines() if line.strip())
            bill_to_paragraphs.append(Paragraph(formatted_addr, body_text))
        if cust_email:
            bill_to_paragraphs.append(Paragraph(f"Email: {cust_email}", body_text))
        if cust_phone:
            bill_to_paragraphs.append(Paragraph(f"Phone: {cust_phone}", body_text))

        # Format Dates
        issue_dt_str = invoice.issue_date.strftime("%b %d, %Y") if invoice.issue_date else "N/A"
        due_dt_str = invoice.due_date.strftime("%b %d, %Y") if invoice.due_date else "N/A"
        period_str = (
            f"{invoice.billing_period_start.strftime('%Y-%m-%d')} to {invoice.billing_period_end.strftime('%Y-%m-%d')}"
            if invoice.billing_period_start and invoice.billing_period_end
            else "N/A"
        )
        sub_str = (
            xml_escape(invoice.subscription.subscription_number)
            if invoice.subscription and invoice.subscription.subscription_number
            else "Direct Billing"
        )

        details_paragraphs = [
            Paragraph("INVOICE DETAILS", section_heading),
            Spacer(1, 3),
            Paragraph(f"<b>Issue Date:</b> {issue_dt_str}", body_text),
            Paragraph(f"<b>Due Date:</b> {due_dt_str}", body_text),
            Paragraph(f"<b>Billing Period:</b> {period_str}", body_text),
            Paragraph(f"<b>Subscription:</b> {sub_str}", body_text),
        ]

        meta_grid = Table(
            [[bill_to_paragraphs, details_paragraphs]],
            colWidths=[300, 240]
        )
        meta_grid.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(meta_grid)
        elements.append(Spacer(1, 16))

        # ---------------------------------------------------------
        # 3. LINE ITEMS TABLE (Historical Snapshots)
        # ---------------------------------------------------------
        # Column widths: # (24), Description (246), Qty (40), Unit Price (70), Tax Rate (60), Line Total (100) = 540 pt
        table_data = [
            [
                Paragraph("#", tbl_hdr_left),
                Paragraph("Description", tbl_hdr_left),
                Paragraph("Qty", tbl_hdr_right),
                Paragraph("Unit Price", tbl_hdr_right),
                Paragraph("Tax Rate", tbl_hdr_right),
                Paragraph("Total", tbl_hdr_right),
            ]
        ]

        items = invoice.items or []
        for idx, item in enumerate(items, start=1):
            desc_escaped = xml_escape(item.description)
            desc_p = Paragraph(desc_escaped, tbl_cell_left)
            qty_p = Paragraph(str(item.quantity), tbl_cell_right)
            unit_price_p = Paragraph(f"${item.unit_price:,.2f}", tbl_cell_right)
            tax_rate_p = Paragraph(f"{item.tax_rate:.1f}%", tbl_cell_right)
            line_total_p = Paragraph(f"${item.line_total:,.2f}", tbl_cell_right)

            table_data.append([
                Paragraph(str(idx), tbl_cell_left),
                desc_p,
                qty_p,
                unit_price_p,
                tax_rate_p,
                line_total_p
            ])

        items_table = Table(table_data, colWidths=[24, 246, 40, 70, 60, 100], repeatRows=1)
        items_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ]

        # Alternating row colors
        for r in range(1, len(table_data)):
            if r % 2 == 0:
                items_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F8FAFC")))

        items_table.setStyle(TableStyle(items_style))
        elements.append(items_table)
        elements.append(Spacer(1, 14))

        # ---------------------------------------------------------
        # 4. FINANCIAL TOTALS SUMMARY (Strict Non-Mutating Read)
        # ---------------------------------------------------------
        # Subtotal, Tax, Discount, Total, Amount Paid, Balance Due
        subtotal_val = invoice.subtotal
        tax_val = invoice.tax_amount
        discount_val = invoice.discount_amount
        total_val = invoice.total
        paid_val = invoice.amount_paid
        balance_val = invoice.balance_due

        discount_str = f"-${discount_val:,.2f}" if discount_val > Decimal("0.00") else "$0.00"

        # Balance Due style
        balance_color = "#15803D" if balance_val <= Decimal("0.00") else "#B91C1C"
        balance_val_style = ParagraphStyle(
            "BalanceVal",
            parent=summary_val,
            fontSize=11,
            leading=14,
            textColor=colors.HexColor(balance_color)
        )
        total_val_style = ParagraphStyle(
            "TotalVal",
            parent=summary_val,
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#0F172A")
        )

        summary_rows = [
            [Paragraph("Subtotal:", summary_lbl), Paragraph(f"${subtotal_val:,.2f}", summary_val)],
            [Paragraph("Tax Amount:", summary_lbl), Paragraph(f"${tax_val:,.2f}", summary_val)],
            [Paragraph("Discount:", summary_lbl), Paragraph(discount_str, summary_val)],
            [Paragraph("Total Amount:", summary_lbl), Paragraph(f"${total_val:,.2f}", total_val_style)],
            [Paragraph("Amount Paid:", summary_lbl), Paragraph(f"${paid_val:,.2f}", summary_val)],
            [Paragraph("Balance Due:", summary_lbl), Paragraph(f"${balance_val:,.2f}", balance_val_style)],
        ]

        summary_table = Table(summary_rows, colWidths=[120, 100])
        summary_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("LINEABOVE", (0, 3), (-1, 3), 0.75, colors.HexColor("#CBD5E1")),
            ("LINEBELOW", (0, 3), (-1, 3), 0.75, colors.HexColor("#CBD5E1")),
            ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#F8FAFC")),
            ("LINEBELOW", (0, 5), (-1, 5), 1.0, colors.HexColor(balance_color)),
        ]))

        # Align summary to the right
        totals_wrapper = Table(
            [[Paragraph("", body_text), summary_table]],
            colWidths=[320, 220]
        )
        totals_wrapper.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(KeepTogether(totals_wrapper))
        elements.append(Spacer(1, 14))

        # ---------------------------------------------------------
        # 5. PAYMENT HISTORY (If recorded payments exist)
        # ---------------------------------------------------------
        payments = invoice.payments or []
        successful_payments = [p for p in payments if getattr(p, "status", None)]
        if successful_payments:
            pay_heading = [
                Paragraph("PAYMENT HISTORY", section_heading),
                Spacer(1, 4),
            ]
            pay_table_data = [
                [
                    Paragraph("Date", tbl_hdr_left),
                    Paragraph("Method", tbl_hdr_left),
                    Paragraph("Reference", tbl_hdr_left),
                    Paragraph("Status", tbl_hdr_left),
                    Paragraph("Amount", tbl_hdr_right),
                ]
            ]
            for p in successful_payments:
                dt = getattr(p, "payment_date", None) or getattr(p, "created_at", None)
                p_date = dt.strftime("%Y-%m-%d %H:%M") if dt else "N/A"
                p_method = p.payment_method.value if hasattr(p.payment_method, "value") else str(p.payment_method)
                ref_val = getattr(p, "payment_reference", None) or getattr(p, "transaction_reference", None) or "N/A"
                p_ref = xml_escape(str(ref_val))
                p_status = p.status.value if hasattr(p.status, "value") else str(p.status)
                p_amount = p.amount

                pay_table_data.append([
                    Paragraph(p_date, tbl_cell_left),
                    Paragraph(p_method.replace("_", " "), tbl_cell_left),
                    Paragraph(p_ref, tbl_cell_left),
                    Paragraph(p_status, tbl_cell_left),
                    Paragraph(f"${p_amount:,.2f}", tbl_cell_right),
                ])

            pay_table = Table(pay_table_data, colWidths=[110, 100, 150, 80, 100])
            pay_style = [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ]
            for r in range(1, len(pay_table_data)):
                if r % 2 == 0:
                    pay_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F8FAFC")))
            pay_table.setStyle(TableStyle(pay_style))

            elements.append(KeepTogether(pay_heading + [pay_table]))
            elements.append(Spacer(1, 14))

        # ---------------------------------------------------------
        # 6. INVOICE NOTES & REMITTANCE ADVICE
        # ---------------------------------------------------------
        notes_box = [
            Paragraph("PAYMENT TERMS & INSTRUCTIONS", section_heading),
            Spacer(1, 3),
            Paragraph(
                "Please remit balance due prior to the specified due date. Accepted payment methods include "
                "Credit Card, Bank Wire / ACH Transfer, and UPI. For questions regarding this invoice, please reach out "
                "to our finance department at <b>billing@billsync.io</b>.",
                body_text
            )
        ]
        elements.append(KeepTogether(notes_box))

        # ---------------------------------------------------------
        # 7. BUILD PDF USING NUMBERED CANVAS
        # ---------------------------------------------------------
        doc.build(elements, canvasmaker=NumberedCanvas)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
