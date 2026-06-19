from flask import Blueprint, jsonify, render_template_string
from analytics import admin_stats

admin_bp = Blueprint("admin", __name__)

ADMIN_TEMPLATE = """
<!doctype html><html><head><title>JobLens Admin</title><style>
body{font-family:Arial;background:#07111f;color:#eef5ff;margin:0;padding:30px}h1{color:#64b5ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.card,table{background:#0d1d33;border:1px solid #21466d;border-radius:10px;padding:16px}b{font-size:28px;color:#7dd3fc}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #243b55;padding:10px;text-align:left}small{color:#9fb0c7}</style></head><body>
<h1>JobLens V4 Admin Dashboard</h1><div class="grid">
{% for label, value in cards %}<div class="card"><small>{{ label }}</small><br><b>{{ value }}</b></div>{% endfor %}
</div><h2>Most Searched Roles</h2><table><tr><th>Role</th><th>Count</th></tr>{% for role,count in stats.most_searched_job_roles %}<tr><td>{{role}}</td><td>{{count}}</td></tr>{% endfor %}</table>
<h2>Most Common Skills</h2><table><tr><th>Skill</th><th>Count</th></tr>{% for skill,count in stats.most_common_skills %}<tr><td>{{skill}}</td><td>{{count}}</td></tr>{% endfor %}</table>
</body></html>
"""


@admin_bp.route("/admin")
def admin_dashboard():
    stats = admin_stats()
    cards = [
        ("Users", stats["total_users"]),
        ("Sessions", stats["total_sessions"]),
        ("CV Uploads", stats["total_cv_uploads"]),
        ("Downloads", stats["total_downloads"]),
        ("Analyses", stats["total_analyses"]),
        ("Avg Match", f"{stats['average_match_score']}%"),
    ]
    return render_template_string(ADMIN_TEMPLATE, stats=stats, cards=cards)


@admin_bp.route("/api/admin/stats")
def admin_stats_api():
    return jsonify(admin_stats())
