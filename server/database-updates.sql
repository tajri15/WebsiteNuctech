ALTER TABLE scans 

ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0,

ADD COLUMN IF NOT EXISTS last_resend_time TIMESTAMP,

ADD COLUMN IF NOT EXISTS resend_status VARCHAR(50);



-- Menambahkan kolom untuk tracking validasi OCR

ALTER TABLE scans

ADD COLUMN IF NOT EXISTS ocr_validated BOOLEAN DEFAULT FALSE,

ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2),

ADD COLUMN IF NOT EXISTS ocr_validation_time TIMESTAMP,

ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20);



-- Menambahkan kolom untuk path gambar tambahan (7 dan 8)

ALTER TABLE scans

ADD COLUMN IF NOT EXISTS image7_path VARCHAR(500),

ADD COLUMN IF NOT EXISTS image8_path VARCHAR(500);



-- Index untuk performa query validasi

CREATE INDEX IF NOT EXISTS idx_scans_container_no ON scans(container_no);

CREATE INDEX IF NOT EXISTS idx_scans_scan_time ON scans(scan_time);

CREATE INDEX IF NOT EXISTS idx_scans_validation_status ON scans(validation_status);



-- View untuk memudahkan query container validation

CREATE OR REPLACE VIEW v_container_validation AS

SELECT 

    id,

    id_scan,

    container_no,

    truck_no,

    scan_time,

    status,

    image1_path,

    image2_path,

    image3_path,

    image4_path,

    image5_path,

    image6_path,

    image7_path,

    image8_path,

    -- Validasi format container

    CASE 

        WHEN container_no IS NULL OR container_no = '' OR container_no ILIKE '%scan failed%' 

        THEN 'empty_or_failed'

        WHEN container_no ~ '^[A-Z]{4}[0-9]{7}$' OR container_no ~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$'

        THEN 'valid'

        ELSE 'invalid_format'

    END as validation_reason,

    -- Status valid atau tidak

    CASE 

        WHEN container_no ~ '^[A-Z]{4}[0-9]{7}$' OR container_no ~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$'

        THEN TRUE

        ELSE FALSE

    END as is_valid,

    -- Hitung jumlah gambar

    (

        CASE WHEN image1_path IS NOT NULL AND image1_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image2_path IS NOT NULL AND image2_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image3_path IS NOT NULL AND image3_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image4_path IS NOT NULL AND image4_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image5_path IS NOT NULL AND image5_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image6_path IS NOT NULL AND image6_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image7_path IS NOT NULL AND image7_path != '' THEN 1 ELSE 0 END +

        CASE WHEN image8_path IS NOT NULL AND image8_path != '' THEN 1 ELSE 0 END

    ) as image_count

FROM scans;



-- Fungsi untuk mendapatkan statistik validasi

CREATE OR REPLACE FUNCTION get_validation_statistics(

    start_date TIMESTAMP DEFAULT NULL,

    end_date TIMESTAMP DEFAULT NULL

)

RETURNS TABLE (

    total_containers BIGINT,

    valid_containers BIGINT,

    invalid_containers BIGINT,

    empty_failed_containers BIGINT,

    invalid_format_containers BIGINT,

    valid_percentage NUMERIC

) AS $$

BEGIN

    RETURN QUERY

    SELECT 

        COUNT(*)::BIGINT as total_containers,

        COUNT(CASE WHEN is_valid = TRUE THEN 1 END)::BIGINT as valid_containers,

        COUNT(CASE WHEN is_valid = FALSE THEN 1 END)::BIGINT as invalid_containers,

        COUNT(CASE WHEN validation_reason = 'empty_or_failed' THEN 1 END)::BIGINT as empty_failed_containers,

        COUNT(CASE WHEN validation_reason = 'invalid_format' THEN 1 END)::BIGINT as invalid_format_containers,

        CASE 

            WHEN COUNT(*) > 0 THEN ROUND((COUNT(CASE WHEN is_valid = TRUE THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)

            ELSE 0

        END as valid_percentage

    FROM v_container_validation

    WHERE 

        (start_date IS NULL OR scan_time >= start_date)

        AND (end_date IS NULL OR scan_time <= end_date);

END;

$$ LANGUAGE plpgsql;