-- measurements 중복 저장 방지 제약 (PostgreSQL 15 이상)
--
-- 서버(routes/ingest.js)는 아래 제약 이름으로 ON CONFLICT를 사용합니다.
--   ON CONFLICT ON CONSTRAINT uq_meas_sensor_time_depth DO NOTHING
--
-- 일반 UNIQUE는 NULL끼리 서로 다른 값으로 취급합니다. depth_label이 NULL인 센서는
-- 같은 (sensor_id, measured_at)을 다시 보내도 중복으로 인식되지 않아 중복 저장됩니다.
-- NULLS NOT DISTINCT를 쓰면 NULL도 같은 값으로 취급해 중복이 막힙니다.
--
-- 적용 범위: 포트폴리오 데모 DB(Supabase, PostgreSQL 17.6). 이관된 운영 DB에는 적용하지 않았습니다.
-- 적용 전 중복 확인(0이어야 제약을 만들 수 있습니다):
--   select count(*) from (select sensor_id, measured_at, depth_label from measurements
--     group by sensor_id, measured_at, depth_label having count(*) > 1) t;

begin;
alter table public.measurements drop constraint uq_meas_sensor_time_depth;
alter table public.measurements add constraint uq_meas_sensor_time_depth
  unique nulls not distinct (sensor_id, measured_at, depth_label);
commit;

-- 되돌리기 (이전 정의)
-- begin;
-- alter table public.measurements drop constraint uq_meas_sensor_time_depth;
-- alter table public.measurements add constraint uq_meas_sensor_time_depth
--   unique (sensor_id, measured_at, depth_label);
-- commit;

-- 검증 (같은 행을 두 번 넣고 건수를 확인한 뒤 일부러 오류로 끝내 되돌립니다)
-- 수정 전 결과: RESULT cnt=2 / 수정 후 결과: RESULT cnt=1
-- do $$
-- declare c int;
-- begin
--   insert into measurements (sensor_id, measured_at, value, depth_label)
--     values (1, '2026-10-01 00:00:00+00', 1.0, null)
--     on conflict on constraint uq_meas_sensor_time_depth do nothing;
--   insert into measurements (sensor_id, measured_at, value, depth_label)
--     values (1, '2026-10-01 00:00:00+00', 1.0, null)
--     on conflict on constraint uq_meas_sensor_time_depth do nothing;
--   select count(*) into c from measurements
--     where sensor_id = 1 and measured_at = '2026-10-01 00:00:00+00';
--   raise exception 'RESULT cnt=%', c;
-- end
-- $$;
