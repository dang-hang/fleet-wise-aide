from manuals_db import ManualsDB
from tabulate import tabulate

class DatabaseVisualizer:
    def __init__(self, db: ManualsDB):
        self.db = db
    
    def show_all_tables(self):
        """Display all tables with their data"""
        print("=" * 80)
        print("DATABASE OVERVIEW")
        print("=" * 80)
        
        self.show_manuals()
        print()
        self.show_sections()
        print()
        self.show_images()
    
    def show_manuals(self):
        """Display Manuals table"""
        self.db.cursor.execute("SELECT * FROM Manuals")
        rows = self.db.cursor.fetchall()
        
        headers = ["manual_id", "year", "make", "model", "uplifted", "active"]
        
        print("\n📚 MANUALS TABLE")
        print("-" * 80)
        if rows:
            print(tabulate(rows, headers=headers, tablefmt="grid"))
            print(f"Total: {len(rows)} manuals")
        else:
            print("No manuals found.")
    
    def show_sections(self, manual_id=None):
        """Display Sections table"""
        if manual_id:
            self.db.cursor.execute(
                "SELECT * FROM Sections WHERE manual_id = ?", 
                (manual_id,)
            )
            rows = self.db.cursor.fetchall()
            print(f"\n📖 SECTIONS for Manual ID {manual_id}")
        else:
            self.db.cursor.execute("SELECT * FROM Sections")
            rows = self.db.cursor.fetchall()
            print("\n📖 SECTIONS TABLE")
        
        print("-" * 80)
        headers = ["manual_id", "section_name", "first_page", "length", "h_level"]
        
        if rows:
            print(tabulate(rows, headers=headers, tablefmt="grid"))
            print(f"Total: {len(rows)} sections")
        else:
            print("No sections found.")
    
    def show_images(self, manual_id=None):
        """Display Images table"""
        if manual_id:
            self.db.cursor.execute(
                "SELECT * FROM Images WHERE manual_id = ?", 
                (manual_id,)
            )
            rows = self.db.cursor.fetchall()
            print(f"\n🖼️  IMAGES for Manual ID {manual_id}")
        else:
            self.db.cursor.execute("SELECT * FROM Images")
            rows = self.db.cursor.fetchall()
            print("\n🖼️  IMAGES TABLE")
        
        print("-" * 80)
        headers = ["manual_id", "page", "x", "y", "w", "h"]
        
        if rows:
            print(tabulate(rows, headers=headers, tablefmt="grid"))
            print(f"Total: {len(rows)} images")
        else:
            print("No images found.")
    
    def show_manual_details(self, manual_id: int):
        """Show all data for a specific manual"""
        print("=" * 80)
        print(f"MANUAL DETAILS - ID: {manual_id}")
        print("=" * 80)
        
        # Get manual info
        self.db.cursor.execute(
            "SELECT * FROM Manuals WHERE manual_id = ?", 
            (manual_id,)
        )
        manual = self.db.cursor.fetchone()
        
        if not manual:
            print(f"Manual ID {manual_id} not found.")
            return
        
        print(f"\nVehicle: {manual[1]} {manual[2]} {manual[3]}")
        print(f"Uplifted: {'Yes' if manual[4] else 'No'}")
        print(f"Active: {'Yes' if manual[5] else 'No'}")
        
        self.show_sections(manual_id)
        print()
        self.show_images(manual_id)
    
    def show_stats(self):
        """Show database statistics"""
        print("=" * 80)
        print("DATABASE STATISTICS")
        print("=" * 80)
        
        # Count manuals
        self.db.cursor.execute("SELECT COUNT(*) FROM Manuals WHERE active = 1")
        active_manuals = self.db.cursor.fetchone()[0]
        
        self.db.cursor.execute("SELECT COUNT(*) FROM Manuals")
        total_manuals = self.db.cursor.fetchone()[0]
        
        # Count sections
        self.db.cursor.execute("SELECT COUNT(*) FROM Sections")
        total_sections = self.db.cursor.fetchone()[0]
        
        # Count images
        self.db.cursor.execute("SELECT COUNT(*) FROM Images")
        total_images = self.db.cursor.fetchone()[0]
        
        # Average sections per manual
        avg_sections = total_sections / total_manuals if total_manuals > 0 else 0
        
        stats = [
            ["Total Manuals", total_manuals],
            ["Active Manuals", active_manuals],
            ["Total Sections", total_sections],
            ["Total Images", total_images],
            ["Avg Sections/Manual", f"{avg_sections:.1f}"]
        ]
        
        print(tabulate(stats, headers=["Metric", "Value"], tablefmt="grid"))


# Interactive CLI
def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python db_visualizer.py <database_name.db> [options]")
        print("\nOptions:")
        print("  --all              Show all tables")
        print("  --stats            Show statistics")
        print("  --manual <id>      Show specific manual details")
        print("  --manuals          Show only Manuals table")
        print("  --sections [id]    Show Sections (optionally for specific manual)")
        print("  --images [id]      Show Images (optionally for specific manual)")
        return
    
    db_name = sys.argv[1]
    db = ManualsDB(db_name)
    viz = DatabaseVisualizer(db)
    
    if len(sys.argv) == 2 or "--all" in sys.argv:
        viz.show_all_tables()
    
    if "--stats" in sys.argv:
        viz.show_stats()
    
    if "--manuals" in sys.argv:
        viz.show_manuals()
    
    if "--sections" in sys.argv:
        idx = sys.argv.index("--sections")
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            viz.show_sections(int(sys.argv[idx + 1]))
        else:
            viz.show_sections()
    
    if "--images" in sys.argv:
        idx = sys.argv.index("--images")
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            viz.show_images(int(sys.argv[idx + 1]))
        else:
            viz.show_images()
    
    if "--manual" in sys.argv:
        idx = sys.argv.index("--manual")
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            viz.show_manual_details(int(sys.argv[idx + 1]))
        else:
            print("Error: --manual requires a manual ID")


if __name__ == "__main__":
    main()