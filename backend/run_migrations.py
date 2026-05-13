from pathlib import Path

from sqlalchemy import inspect

from app.db import engine
from app.db import Base
from app import models  # noqa: F401


def main() -> None:
    migrations_dir = Path(__file__).parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    if not sql_files:
        print("No SQL migrations found.")
        return

    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    if not existing_tables:
        print("Database is empty. Creating schema from SQLAlchemy models ...")
        Base.metadata.create_all(bind=engine)
        print("Schema created successfully.")
        return

    with engine.begin() as conn:
        for path in sql_files:
            print(f"Applying {path.name} ...")
            sql = path.read_text(encoding="utf-8")
            conn.exec_driver_sql(sql)

    print("Migrations applied successfully.")


if __name__ == "__main__":
    main()
