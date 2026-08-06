-- SBR identifier location-code audit: the IKY collision and the IBA orphan.
--
-- Read-only. Every statement below is a SELECT. Nothing here writes, and nothing here should be run
-- inside a transaction that later writes.
--
-- Why this file exists. Neither the agent that found the defect nor the reviewer who confirmed it
-- has database access, so the counts are a named gap rather than a figure. The investigation is
-- written down here so that whoever does have access fills the numbers in without reconstructing
-- it. Paste the results into docs/HANDOVER.md under the E9-S1 entry.
--
-- ---------------------------------------------------------------------------------------------
-- THE MECHANISM
--
-- backend/src/sbr-id/sbr-id.service.ts holds LOCATION_CODES as an ordered array, tested top down by
-- resolveLocationCode, first match wins, with an unconditional "LOS" fallback:
--
--     /ikorodu/i                                                          -> IKY
--     /abuja|fct/i                                                        -> ABJ
--     /port\s*harcourt/i                                                  -> PHC
--     /ibadan/i                                                           -> IBA
--     /kano/i                                                             -> KAN
--     /enugu/i                                                            -> ENU
--     /calabar/i                                                          -> CAL
--     /lagos|ikeja|lekki|victoria\s*island|ikoyi|ajah|surulere|yaba/i      -> LOS
--     (no match)                                                          -> LOS
--
-- The SafeBuy Realties ID Standard, section 5.0, Property Location Codes (Lagos), says:
--
--     Ikoyi    - IKY
--     Ikorodu  - IKD
--
-- and section 6.0, National Location Codes, says:
--
--     Ibadan   - IBD
--
-- Two consequences follow from the array order alone, before anyone counts anything.
--
-- 1. IKY is emitted for exactly one input, an address matching /ikorodu/i. Ikoyi has no pattern of
--    its own; it appears only inside the eighth entry's alternation, which yields LOS. So every
--    -IKY- identifier in the database is an Ikorodu record, and the number of correctly coded Ikoyi
--    identifiers is zero. There is no mixed population, and therefore no separation problem: the
--    query below is a count, not a classification.
--
-- 2. IBA is emitted for /ibadan/i, and IBA is not a code in either register. IBD is.
--
-- THE SEVERITY SPLIT, which is why the two need different treatment rather than one sweep.
--
--   IKY is a COLLISION. The code is valid and it names somewhere else. An IKY identifier reads as a
--   correctly coded Ikoyi property and is an Ikorodu property, which is a different local
--   government, a different land registry and a different market. Nothing about the record looks
--   wrong. A rewrite is a data correction with a real before and after, and under FinGov section
--   8.2 a correction is a reversal plus a replacement, so each one becomes two id_register rows.
--
--   IBA is an ORPHAN. The code is in neither register, so an IBA identifier resolves to nothing and
--   is visibly invalid to anything that validates it. Its meaning is unambiguous: it can only have
--   come from /ibadan/i. A rewrite to IBD loses no information and needs no interpretation.
--
-- THE FINDING THAT SUPERSEDES BOTH, and the reason a count does not change what has to be written
-- down. Section 2.0 rule 7 requires property identifiers to draw their LOC segment from the
-- property register in section 5.0. Every entry in LOCATION_CODES except IKY and IBA is a national
-- code from section 6.0, and Ikoyi, Lekki, Victoria Island, Ajah, Surulere and Yaba all collapse
-- into LOS. So every property identifier the platform has ever issued is coded against the national
-- register when the property register is required. That is not a subset of the estate, it is all of
-- it, and no count makes it larger or smaller.
--
-- ---------------------------------------------------------------------------------------------

-- QUERY 1. Every identifier carrying the colliding IKY segment, by the table it lives in.
--
-- Read the total as "Ikorodu records wearing Ikoyi's code". Read a zero in the last row of query 3
-- as confirmation that no correctly coded Ikoyi identifier exists to be confused with them.
SELECT 'User.publicId'                     AS "column", count(*) AS "iky_rows"
  FROM "User"                WHERE "publicId"            LIKE '%-IKY-%'
UNION ALL
SELECT 'Listing.propertyId',                count(*)
  FROM "Listing"             WHERE "propertyId"          LIKE '%-IKY-%'
UNION ALL
SELECT 'Transaction.caseId',                count(*)
  FROM "Transaction"         WHERE "caseId"              LIKE '%-IKY-%'
UNION ALL
SELECT 'Payment.transactionPublicId',       count(*)
  FROM "Payment"             WHERE "transactionPublicId" LIKE '%-IKY-%'
UNION ALL
SELECT 'due_diligence_orders.serviceId',    count(*)
  FROM "due_diligence_orders" WHERE "serviceId"          LIKE '%-IKY-%'
UNION ALL
SELECT 'due_diligence_orders.caseId',       count(*)
  FROM "due_diligence_orders" WHERE "caseId"             LIKE '%-IKY-%'
UNION ALL
SELECT 'service_requests.serviceId',        count(*)
  FROM "service_requests"    WHERE "serviceId"           LIKE '%-IKY-%'
UNION ALL
SELECT 'service_requests.caseId',           count(*)
  FROM "service_requests"    WHERE "caseId"              LIKE '%-IKY-%'
UNION ALL
-- The counters, not the identifiers. A prefix row means the code has been minted at least once and
-- says how many were handed out under it, which catches identifiers since deleted.
SELECT 'id_sequences.prefix (issued total)', coalesce(sum("lastValue"), 0)
  FROM "id_sequences"        WHERE "prefix"              LIKE '%-IKY'
ORDER BY 1;

-- QUERY 2. The same for the orphaned IBA segment, which needs the different treatment above.
SELECT 'User.publicId'                     AS "column", count(*) AS "iba_rows"
  FROM "User"                WHERE "publicId"            LIKE '%-IBA-%'
UNION ALL
SELECT 'Listing.propertyId',                count(*)
  FROM "Listing"             WHERE "propertyId"          LIKE '%-IBA-%'
UNION ALL
SELECT 'Transaction.caseId',                count(*)
  FROM "Transaction"         WHERE "caseId"              LIKE '%-IBA-%'
UNION ALL
SELECT 'Payment.transactionPublicId',       count(*)
  FROM "Payment"             WHERE "transactionPublicId" LIKE '%-IBA-%'
UNION ALL
SELECT 'due_diligence_orders.serviceId',    count(*)
  FROM "due_diligence_orders" WHERE "serviceId"          LIKE '%-IBA-%'
UNION ALL
SELECT 'due_diligence_orders.caseId',       count(*)
  FROM "due_diligence_orders" WHERE "caseId"             LIKE '%-IBA-%'
UNION ALL
SELECT 'service_requests.serviceId',        count(*)
  FROM "service_requests"    WHERE "serviceId"           LIKE '%-IBA-%'
UNION ALL
SELECT 'service_requests.caseId',           count(*)
  FROM "service_requests"    WHERE "caseId"              LIKE '%-IBA-%'
UNION ALL
SELECT 'id_sequences.prefix (issued total)', coalesce(sum("lastValue"), 0)
  FROM "id_sequences"        WHERE "prefix"              LIKE '%-IBA'
ORDER BY 1;

-- QUERY 3. The estate in one result, which is the figure worth quoting.
--
-- Every distinct location segment the platform has minted, with how many identifiers went out under
-- it, and which register it belongs to. The last column is the answer to "how bad is it": every row
-- reading 'not in either register' or 'national code used for a property' is a defect, and the sum
-- of the property rows is the size of the E9-S2 correction.
SELECT
  split_part("prefix", '-', array_length(string_to_array("prefix", '-'), 1)) AS "loc_segment",
  "prefix",
  sum("lastValue")                                                          AS "issued",
  CASE
    WHEN split_part("prefix", '-', array_length(string_to_array("prefix", '-'), 1))
         IN ('IKY','VTI','LEK','AJH','SGT','IBL','IKD','IKJ','SUR','YAB','MRY','GBD','KET','MGD',
             'OGD','FST','APA','AGG','ALM','BDG','ISL','MSH','OSD','OJO','EGB','IPJ','IKT','EPE',
             'BNI','ONR','CHV','VGC')
      THEN 'property register, section 5.0'
    WHEN split_part("prefix", '-', array_length(string_to_array("prefix", '-'), 1))
         IN ('LOS','ABJ','PHC','IBD','ABK','AKR','AEK','OSG','ILR','BEN','ASB','WAR')
      THEN 'national register, section 6.0'
    ELSE 'not in either register'
  END                                                                       AS "register"
FROM "id_sequences"
GROUP BY 1, 2
ORDER BY 3 DESC, 1;

-- QUERY 4. The zero this whole file turns on, stated as a query so it is checked rather than
-- asserted. A correctly coded Ikoyi property identifier would have to be an IKY row whose listing
-- location says Ikoyi. If this returns anything other than zero, the mechanism above is wrong and
-- the E9-S2 correction must classify rather than rewrite.
SELECT count(*) AS "listings_coded_IKY_that_are_actually_in_Ikoyi"
FROM "Listing"
WHERE "propertyId" LIKE '%-IKY-%'
  AND "location" ~* 'ikoyi';
