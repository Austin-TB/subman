-- Integrity rules Prisma can't express (PLAN.md §3)
ALTER TABLE "Product"      ADD CONSTRAINT product_prices_nonneg   CHECK ("salesPrice" >= 0 AND "costPrice" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT variant_extra_nonneg  CHECK ("extraPrice" >= 0);
ALTER TABLE "Tax"          ADD CONSTRAINT tax_rate_nonneg         CHECK ("rate" >= 0);
ALTER TABLE "PaymentTerm"  ADD CONSTRAINT term_days_nonneg        CHECK ("dueDays" >= 0);
ALTER TABLE "Plan"         ADD CONSTRAINT plan_values_valid       CHECK ("price" >= 0 AND "interval" >= 1 AND "minQuantity" >= 1);
ALTER TABLE "QuotationTemplate" ADD CONSTRAINT template_validity  CHECK ("validityDays" >= 0);
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT tline_valid    CHECK ("quantity" >= 1 AND ("unitPrice" IS NULL OR "unitPrice" >= 0));
ALTER TABLE "Subscription" ADD CONSTRAINT sub_recurring_nonneg    CHECK ("recurringAmount" >= 0);
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT sline_valid         CHECK ("quantity" >= 1 AND "unitPrice" >= 0);
ALTER TABLE "Discount"     ADD CONSTRAINT discount_valid          CHECK ("value" >= 0 AND "usedCount" >= 0
                                                                     AND ("usageLimit" IS NULL OR "usedCount" <= "usageLimit")
                                                                     AND ("minPurchase" IS NULL OR "minPurchase" >= 0)
                                                                     AND ("minQuantity" IS NULL OR "minQuantity" >= 0));
ALTER TABLE "DiscountUsage" ADD CONSTRAINT dusage_nonneg          CHECK ("amount" >= 0);
ALTER TABLE "Invoice"      ADD CONSTRAINT invoice_money_nonneg    CHECK ("untaxed" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0
                                                                     AND "total" >= 0 AND "amountPaid" >= 0 AND "amountDue" >= 0);
ALTER TABLE "InvoiceLine"  ADD CONSTRAINT iline_valid             CHECK ("quantity" >= 1 AND "unitPrice" >= 0 AND "amount" >= 0
                                                                     AND "discountAmount" >= 0 AND "subtotal" >= 0 AND "taxAmount" >= 0 AND "total" >= 0);
ALTER TABLE "Payment"      ADD CONSTRAINT payment_amount_pos      CHECK ("amount" > 0);
