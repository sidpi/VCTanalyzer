"""Seed demo data: org, users, teams, players, and a match ready for upload.

Requires the schema to exist first:  alembic upgrade head
"""

from sqlalchemy import inspect

from .db import SessionLocal, engine
from . import models, security


def run() -> None:
    if not inspect(engine).has_table("users"):
        raise SystemExit(
            "No schema found. Run 'alembic upgrade head' first "
            "(see backend/README.md)."
        )
    db = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.email == "coach@fnatic.gg").first():
            print("seed: already present")
            return

        org = models.Organization(name="FNATIC")
        db.add(org)
        db.flush()

        admin = models.User(
            email="admin@vct.gg",
            password_hash=security.hash_password("adminpassword"),
            display_name="Admin",
            is_admin=True,
        )
        coach = models.User(
            email="coach@fnatic.gg",
            password_hash=security.hash_password("coachpassword"),
            display_name="Head Coach",
            organization_id=org.id,
        )
        db.add_all([admin, coach])

        fnatic = models.Team(name="FNATIC", region="Europe", organization_id=org.id)
        g2 = models.Team(name="G2 Esports", region="Europe")
        db.add_all([fnatic, g2])
        db.flush()

        fnatic_names = [
            ("Leo", "Jett", "Duelist"),
            ("Chronicle", "Viper", "Controller"),
            ("Boaster", "Astra", "Controller"),
            ("Derke", "Raze", "Duelist"),
            ("Mistic", "Sova", "Initiator"),
        ]
        g2_names = [
            ("NiKo", "Jett", "Duelist"),
            ("Mixwell", "Omen", "Controller"),
            ("hoody", "Skye", "Initiator"),
            ("koldamenta", "Viper", "Controller"),
            ("zeek", "Chamber", "Sentinel"),
        ]
        for team, roster in ((fnatic, fnatic_names), (g2, g2_names)):
            for name, agent, role in roster:
                player = models.Player(name=name, agent=agent, role=role)
                db.add(player)
                db.flush()
                db.add(models.TeamPlayer(team_id=team.id, player_id=player.id))

        match = models.Match(
            team_a_id=fnatic.id,
            team_b_id=g2.id,
            map="ascent",
            type="scrim",
            played_at="2026-09-12",
        )
        db.add(match)
        db.commit()

        print("seed: created org, users (coach@fnatic.gg / coachpassword),")
        print("      teams FNATIC + G2, rosters, and match", match.id)
    finally:
        db.close()


if __name__ == "__main__":
    run()
