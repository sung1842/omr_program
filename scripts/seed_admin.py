"""Seed the fixed admin account into Supabase Auth."""

from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip('"')
    return env


def main() -> None:
    env = load_env()
    ref = env["NEXT_PUBLIC_SUPABASE_URL"].split("//", 1)[1].split(".", 1)[0]
    sql = (ROOT / "supabase" / "migrations" / "20260818150000_seed_admin.sql").read_text(
        encoding="utf-8"
    )
    password = env["SUPABASE_DB_PASSWORD"]
    targets = [
        (f"db.{ref}.supabase.co", 5432, "postgres"),
        ("aws-0-ap-northeast-2.pooler.supabase.com", 6543, f"postgres.{ref}"),
        ("aws-1-ap-northeast-2.pooler.supabase.com", 6543, f"postgres.{ref}"),
        ("aws-0-ap-northeast-1.pooler.supabase.com", 6543, f"postgres.{ref}"),
        ("aws-0-ap-southeast-1.pooler.supabase.com", 6543, f"postgres.{ref}"),
    ]
    last_error: Exception | None = None
    for host, port, user in targets:
        try:
            with psycopg.connect(
                host=host,
                port=port,
                dbname="postgres",
                user=user,
                password=password,
                sslmode="require",
                connect_timeout=8,
            ) as conn:
                conn.execute(sql)
                conn.commit()
            print(f"admin seeded via {host}:{port}")
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"skip {host}:{port} ({type(exc).__name__})")
    raise SystemExit(f"failed to seed admin: {last_error}")


if __name__ == "__main__":
    main()
