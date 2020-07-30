import sqlite3
import regex as re
import ftfy
import sys
import os

"""
This program transforms the content of txtFiles/output.txt into a 
SQLite3 database. We define multiple different tables in order to make use
of the tabular nature of the data.

Our schema is as follows:

cells(table_id, row_id, col_id, value, location)
titles(table_id, title)
captions(table_id, caption)
columns(table_id, col_id, type)
keywords_cell_header(keyword, table_id, row_id, col_id, location)
keywords_title_caption(table_id, location, keyword)
"""
def main():
    db_name = './database.db'

    try:
        os.remove(db_name)
    except FileNotFoundError:
        pass
    conn = sqlite3.connect(db_name)

    c = conn.cursor()

    c.execute("""CREATE TABLE cells(table_id integer, row_id integer, col_id integer, value text, location text,
                PRIMARY KEY (table_id, row_id, col_id));""")
    cells = { }

    c.execute("""CREATE TABLE titles(table_id integer, title text,
                PRIMARY KEY (table_id));""")
    titles = { }

    c.execute("""CREATE TABLE captions(table_id integer, caption text,
                PRIMARY KEY (table_id));""")
    captions = { }

    c.execute("""CREATE TABLE columns(table_id integer, col_id integer, type varchar,
                    PRIMARY KEY (table_id, col_id));""")
    columns = { }

    """ No longer using, uncomment if using """
    # c.execute("""CREATE TABLE headers(table_id integer, row_id integer, col_id integer, header text,
    #             PRIMARY KEY (table_id, row_id, col_id));""")
    headers = set() # Set of row ids identified to be headers

    c.execute("""CREATE TABLE keywords_cell_header(keyword varchar, table_id integer, row_id integer, col_id integer, location varchar,
                PRIMARY KEY (keyword, table_id, row_id, col_id));""")
    kwCellHeader = { }

    c.execute("""CREATE TABLE keywords_title_caption(table_id integer, location varchar, keyword varchar,
                PRIMARY KEY (table_id, location, keyword));""")
    kwTitleCaption = { }

    table_num = 0
    row_id = 0
    location = None

    for line in sys.stdin:
        line = line.strip()
        if len(line) == 0:
            continue

        if re.match(r"^title", line):
            if (table_num + 1) % 10 == 0:
                sys.stderr.write('\r{0} tables added into the database'.format(table_num + 1))
                sys.stderr.flush()
            headers = set()
            location = 'title'
            row_id = -1
            table_num += 1
            line = re.sub(r"^title:? ?", "", line)
            handle_title(titles, table_num, line)
            line = re.sub(r"^(?:List of )?", "", line)
            title = line

            # types always comes after title
            line = re.sub(r"^types:? ?", "", sys.stdin.readline().strip())

            line = re.sub(r"(?:int\d+|float\d+)", "numerical", line)
            line = re.sub(r"object", "text", line)
            handle_cols(columns, table_num, line.split(", "))
            
            line = title
            
        elif re.match(r"^caption", line):
            location = 'caption'
            row_id -= 1
            line = re.sub(r"^caption:? *", "", line)
            if len(line) > 0:
                handle_caption(captions, table_num, line)
    
        elif re.match(r"^header", line):
            line = re.sub(r"^header:? ?", "", line)
            headers.add(int(line))
            continue
    
        else:
            location = 'cell' if row_id not in headers else 'header'
            line = line[1: -1].split('", "')
            handle_cells(cells, table_num, row_id, line, location)

        if type(line) == list:
            line = list(map(str.lower, line))
        else:
            line = line.lower()

        handle_keywords(kwCellHeader, kwTitleCaption, table_num, location, row_id, line)
        row_id += 1

    # Perform insertions
    print("\nInserting into cells")
    c.executemany("INSERT INTO cells VALUES (?, ?, ?, ?, ?);", cells.values())
    print("Inserted into cells")
    c.executemany("INSERT INTO titles VALUES (?, ?);", titles.values())
    print("Inserted into titles")
    c.executemany("INSERT INTO captions VALUES (?, ?);", captions.values())
    print("Inserted into captions")
    c.executemany("INSERT INTO columns VALUES (?, ?, ?);", columns.values())
    print("Inserted into columns")
    c.executemany("INSERT INTO keywords_cell_header VALUES (?, ?, ?, ?, ?);", kwCellHeader.values())
    print("Inserted into keywords_cell_header")
    c.executemany("INSERT INTO keywords_title_caption VALUES (?, ?, ?);", kwTitleCaption.values())
    print("Inserted into keywords_title_caption")
    print("Creating indices")
    c.execute("CREATE INDEX idx_kwch_kw ON keywords_cell_header(keyword);")
    c.execute("CREATE INDEX idx_kwtc_kw ON keywords_title_caption(keyword);")

    print("Finished creating database")

    conn.commit()
    conn.close()

    return


def handle_title(titles, table_num, line):
    """
    Inserts titles into the 'titles' table

    Arguments:
    titles: the titles dictionary
    table_num: the table number
    line: The title to be inserted
    """
    titles[table_num] = (table_num, line)
    return

def handle_cols(columns, table_num, types):
    """
    Inserts types into the 'types' table

    Arguments:
    columns: the columns dictionary
    table_num: the table number
    line: The title to be inserted
    """
    for i, t in enumerate(types):
        columns[(table_num, i)] = (table_num, i, t)
    return


def handle_caption(captions, table_num, line):
    """
    Inserts captions into the 'captions' table

    Arguments:
    captions: the captions dictionary
    table_num: the table number
    line: The caption to be inserted
    """
    
    captions[(table_num)] = (table_num, f'{captions.get((table_num), (None, ""))[1]} {line}')
    return

def handle_cells(cells, table_num, row_id, line, location):
    """
    Inserts cells into the 'cells' table

    Arguments:
    cells: the cells dictionary
    table_num: the table number
    row_id: the id of the cell's row
    line: The list of cells to be inserted
    location: the location of the cell (cell or header)
    """
    for i, value in enumerate(line):
        value = fixValue(value)
        cells[(table_num, row_id, i)] = (table_num, row_id, i, value, location)
    return


def handle_keywords(kwch, kwtc, table_num, location, row_id, line):
    """
    Inserts all keywords in 'line' into the correct keywords
    table, depending on 'location'.

    Arguments:
    kwch: The cell & header keywords dictionary
    kwtc: The title & caption keywords dictionary
    table_num: the table number
    location: The location of the keyword [cell, title, caption, header]
    row_id: the row_id of the line
    line: The list of cells containing the keywords.
    """
    if location in ['cell', 'header']:
        for col, cell in enumerate(line):
            if re.match(r"^File:.*?\.\w{3}$", cell):
                continue
            for word in re.split(r'[ _]+', cell.strip(',.')):
                word = fixValue(word)

                kwch[(word, table_num, row_id, col)] = (word, table_num, row_id, col, location)
    else:
        for word in re.split(r'[ _]+', line):
            word = fixValue(word)

            kwtc[(table_num, location, word)] = (table_num, location, word)

    return


def fixValue(string):
    string = ftfy.fix_text(string)
    return string.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')

"""
cells(tableId, rowId, colId, value)
titles(tableId, title)
captions(tableId, caption)
headers(tableId, colId, header)
keywords_cell_header(keyword, tableId, rowId, colId,location)
keywords_title_caption(table_id, location, keyword)
"""



if __name__ == "__main__":
    main()