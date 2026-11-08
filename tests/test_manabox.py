from bindiver.mtg.manabox import read_manabox_names

HEADER = "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID\n"


def test_read_manabox_names_repeats_each_name_by_quantity(tmp_path):
    path = tmp_path / "scan.csv"
    path.write_text(
        HEADER
        + "Skred,csp,Coldsnap,97,normal,common,2,27144,b3d6\n"
        + '"Leave // Chance",akh,Amonkhet,214,foil,rare,1,1,abcd\n',
        encoding="utf-8",
    )
    assert read_manabox_names(path) == ["Skred", "Skred", "Leave // Chance"]
