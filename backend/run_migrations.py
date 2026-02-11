from pathlib import Path

from app.db import engine


def main() -> None:
    migrations_dir = Path(__file__).parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    if not sql_files:
        print("No SQL migrations found.")
        return

    with engine.begin() as conn:
        for path in sql_files:
            print(f"Applying {path.name} ...")
            sql = path.read_text(encoding="utf-8")
            conn.exec_driver_sql(sql)

    print("Migrations applied successfully.")


if __name__ == "__main__":
    main()
