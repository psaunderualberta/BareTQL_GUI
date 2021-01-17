# BareTQL_GUI
A graphic user interface for BareTQL. Built under supervision of Dr. Davood Rafiei and with the support of an NSERC Undergraduate Research Grant

## Installation Instructions
Once you have cloned the repository, there are a few steps that you need to follow in order to get BareTQL GUI up and running. 
1. Download Nodejs from [Nodejs.org](https://nodejs.org/en/). Ensure that it installed correctly by typing `node -v` in a terminal to check the version installed. If you don't get an error, then it installed correctly. 
    - OPTIONAL: when running the back-end, the server must be restarted every time a change is made to one of the js files. An npm package called `nodemon` monitors js files for changes, and automatically restarts the server every time a file is changed and saved. This step is not mandatory, but if you plan on making changes to the back-end it will save you quite a lot of trouble. Type `npm install -g nodemon` in a terminal to globally install nodemon, or omit the `-g` to install it only for BareTQL. 
1. In your favourite terminal, cd to `../BareTQL_GUI/program/server` and type `npm i` to install the dependencies for the back-end. 
1. Cd to `../BareTQL_GUI/program/client` and again type `npm i` to install the dependencies for the front-end.
1. Finally, cd to `../BareTQL_GUI/program`. If you have installed the npm package `nodemon` as described in the above optional step, run the command `npm start` to start up both the front-end and back-end for the app. The services for the front and back-end will run simultaneously using the npm package `concurrently`. If you see a large printout in the console that is just the `Vue.js` requirements being built. If you have not created a database, you will see the error `Something went wrong with dbPath: server/data/database.db: SqliteError: unable to open database file`. Instructions to construct the database are found on the final step. If you do not have `nodemon` installed, run `npm run start_once` to run the front-end and back-end. Note that if any changes are made to the back-end, you must stop and re-run the command to see the changes. For this reason, if you do not have `nodemon` installed I recommend doing the following instead of running `npm run start_once`:
     - OPTIONAL: If you do not have `nodemon` installed, I recommend starting the front and back-ends in different terminals as restarting Vue.js can take time, and so restarting the back-end only will be better for development. Cd to `../BareTQL_GUI/program/server/` and type `npm run once` to start the back-end, and remember to re-do this after every change to the back-end. Then open a new terminal, cd to `../BareTQL_GUI/program/client/` and type `npm run serve` to start the front-end. Vue.js automatically saves when it detects changes, so manual restarting of the server is only needed on the back-end.


## Data Creation
In order to use BareTQL, you will need a database designed for BareTQL. 
- Currently, BareTQL includes python scripts which accept `.csv` or `.xlsx` files and converts their contents to a SQLite database usable by BareTQL. BareTQL uses the python library `Pandas` to assist with converting the data, and so ensure that the format of the files is acceptable to `Pandas`. If you are not familiar with pandas, then simply ensure that the data is organized into columns and has no more than one row discussing the column names.
    - If your data is already in multiple `.csv` or `.xlsx` files, then move the files you wish to convert into the directory `../data_preprocessing/input` (you'll have to create the folder). Then, you'll need to install the python libraries `pandas, numpy, ftfy` using `pip install pandas numpy ftfy`, which assist with organizing the tables in the csv files and parsing the text. Once this successfully completes, Run the commands `python makeText.py` followed by `python makeDB.py`. This will create the database in the directory `../program/server/data/database.db` using the data files given. 
- If you do not have `.csv` files of the data, and they are stored in some other format, then you will need to either i) convert them to `.csv / .xlsx` and follow the above instructions, or ii) create your own database using the steps outlined below:
    1. Ensure that SQLite3 is installed on your machine. 
    1. Ensure that each table you wish to convert has a specific title, and that the table itself is rectangular in shape (all rows are of equal length). The table may also have a caption which provides a short description of the table. 
        - NULL values in a table are fine, although they will be discussed later. 
    1. In order for BareTQL to perform at its best, some preprocessing to your tables should be performed. Ideally, the number of NULL values in each column should be reduced as low as possible. If a given column cannot be reduced past a threshold of 50% NULL, it is our recommendation that the column be removed from the table for the purposes of BareTQL processing. Some other preprocessing steps may include:
        - Removing dollar signs `$`, cent signs, or non-digit characters from numerical data (excluding '.').
        - Removing extraneous rows.
        - Removing cells which contain significant amounts of data (paragraphs of text, etc.).
        - Ultimately, you'll want to remove as much extraneous data from as many rows as possible. The more condensed a cell's contents are, the faster BareTQL will be able to find relationships between it and other cells.
    1. Give each table a specific i.d. number. This can be a unique random identification number or simply the index of the tables when iterating through them, but it must be unique. 
    1. Run the following `SQLite` code in either a terminal or through a SQLite library for a language of your choice, for a file called `database.db`. This will create the necessary tables that BareTQL needs to run successfully:
        - `CREATE TABLE cells(table_id integer, row_id integer, col_id integer, value text, location text, PRIMARY KEY (table_id, row_id, col_id));`
        - `CREATE TABLE titles(table_id integer, title text, PRIMARY KEY (table_id));`
        - `CREATE TABLE captions(table_id integer, caption text, PRIMARY KEY (table_id));`
        - `CREATE TABLE columns(table_id integer, col_id integer, type varchar,  PRIMARY KEY (table_id, col_id));`
        -  `CREATE TABLE keywords_cell_header(keyword varchar, table_id integer, row_id integer, col_id integer, location varchar, PRIMARY KEY (keyword, table_id, row_id, col_id));`
        - `CREATE TABLE keywords_title_caption(table_id integer, location varchar, keyword varchar, PRIMARY KEY (table_id, location, keyword));`
        - 
        - *Note*: Although the data in the tables can be processed one row at-a-time, we strongly recommend processing all of the data beforehand so that a single insertion of the data into the database is made. This will drastically speed up your program, but is not necessary.
    1. For each cell in each of the table, write the whole contents of the cell to the table `cells` with the following row structure:
        - `<table_id>, <row_id>, <col_id>, <value>, <location>`
        - `table_id` is the i.d. number of the table.
        - `row_id` the 0-indexed position of the row when measured from the top of the table (the first row has row_id 0, second has row_id 1, and so on. ).
        - `col_id` is the 0-indexed position of the cell when measured from the left (the first column has `col_id` 0, second has `col_id` 1, and so on.).
        - `value` is the actual contents of the cell itself.
        - `location` must be one of `cell` or `header`. This term is used to distinguish normal table cells from those which may further categorize the table (i.e. if the table is divided into sections). Rows which denote these sections should use the location `header`, while all other rows should use `cell`. 
        - *IMPORTANT*: Empty cells MUST be written to the database in order for BareTQL to build the table from scratch again. To insert an empty cell, simply leave the `value` as an empty string. 
    1. For all of the cells in all of your tables, split the cell into a list of 'keywords', recording the row i.d. and the column id of the original cell. These are typically all of the space-separated words, but may also be separated based on sentences, punctuation, or any other methodology. For each keyword, insert it into the table `keywords_cell_header` with the following format:
        - `<keyword>, <table_id>, <row_id>, <col_id>, <location>`
        - `keyword` is the keyword itself.
        - `table_id` is the i.d. number of the table.
        - `row_id` the 0-indexed position of the row when measured from the top of the table.
        - `col_id` is the 0-indexed position of the cell when measured from the left. 
        - `location` must be one of `cell` or `header`. This term is used to distinguish normal table cells from those which may further categorize the table (i.e. if the table is divided into sections). Rows which denote these sections should use the location `header`, while all other rows should use `cell`. 
        - *NOTE*: Since NULL cells *by definition* don't have any content, they do not need to be written to this table.
    1. For each title and caption for all tables, split the title / caption into a list of `keywords` using the same separating condition used for the cells above. For each keyword, insert it into the table `keywords_title_caption` with the following format:
        - `<table_id>, <location>, <keyword>`
        - *IMPORTANT*: Notice the different table structure from `keywords_cell_headers`. It is imperative that this structure is correct.
        - `table_id` is the i.d. number of the table.
        - `location` is one of `title` or `caption` which denotes the origin of the keyword.
        - `keyword` is the keyword itself.
    1. For each table, insert the whole title into the table `titles` with the following structure: 
        - `<table_id>, <title>`
        - `table_id` is the i.d. number of the table.
        - `title` is the title of the table.
        - Note that the whole title is written to the database, and so it should not be too long.
    1. In a similar vein, for each table you may write the whole caption into the table `captions` with the following structure:  
        - `<table_id>, <caption>`
        - `table_id` is the i.d. number of the table.
        - `caption` is the caption of the table.
    1. Lastly, we must create the `columns` table. This is arguably the most important table as it allows BareTQL to efficiently map columns to other columns when expanding a seed set. A column can have one of two types: `numerical` or `text`. A numerical column is a column consisting entirely of numbers without any extra notation (a single decimal point is fine, but dollar or cent signs are not and should be removed if a column is to be labelled `numerical`). For each column in each table, it should be determined if said column satisfies the `numerical` property or should be regarded as `text`. Once this categorization has been decided, the following should be inserted into the `columns` table:
        - `<table_id>, <col_id>, <type>`
        - `table_id` is the id of the table which the column came from
        - `col_id` is the 0-indexed i.d. of the column, as described above
        - `type` MUST be one of either `numerical` or `text`. 
    1. Finally, there is one more highly recommended, step to perform, though it is ultimately optional. As it stands, BareTQL must search through the entire database to find the rows and cells it deems most suitable to be returned to the user. This can take quite some time, and can be accelerated if the following SQLite code is run:
        - `CREATE INDEX idx_kwch_kw ON keywords_cell_header(keyword);`
        - `CREATE INDEX idx_kwtc_kw ON keywords_title_caption(keyword);`
        - More indices can be created as required, but the above two indices are typically more than enough to speed up the program to an acceptable level.
    1. Move the completed `database.db` file to the location `../program/server/data/database.db`, start the server as described above in the section `Installation Instructions`, and enjoy BareTQL!
## Data Storage and Querying
- BareTQL uses the SQLite database management system to perform the queries necessary. Rather than directly mapping the tables given to BareTQL to sqlite, we translate the tables into a format which gives each table cell a number of additional attributes to accelerate the querying on the back-end. Operations performed inside the BareTQL GUI trigger API calls to the back-end, where SQLite queries are used to find the rows which most closely match the rows inside the seed set. 

- The database schema is as follows:
    - cells(table_id integer, row_id integer, col_id integer, value text, location text)
        - PRIMARY KEY (table_id, row_id, col_id)
    - titles(table_id integer, title text)
        - PRIMARY KEY (table_id)
    - captions(table_id integer, caption text)
        - PRIMARY KEY (table_id)
    - columns(table_id integer, col_id integer, type varchar)
        - PRIMARY KEY (table_id, col_id)
    - keywords_cell_header(keyword varchar, table_id integer, row_id integer, col_id integer, location varchar)
        - PRIMARY KEY (keyword, table_id, row_id, col_id))
    - keywords_title_caption(table_id integer, location varchar, keyword varchar)
        - PRIMARY KEY (table_id, location, keyword)
    
- This schema allows a table to be built on-the-fly, with custom rows and columns. Moreover, we ensure that the column type is preserved, with numerical columns being mapped to numerical columns, and textual columns mapped to textual columns. Most tables are rather self-explanatory, although there are a few additional criteria which speed up the querying. Each entry in the `cells` table includes its location (whether it is a normal cell or a header / sub-header in the table), which allows us to avoid costly joins when cross-referencing contents with the `titles` or `captions` table. Additionally, the `columns` table includes a `type` column, which assigns a column to be `numerical`, `textual`, or `NULL`. As stated above, this allows columns to be mapped only to columns with identical types and allows us to constrict the allowed mappings, accelerating the querying further. 

- In addition to the schema that is mentioned above, a number of supplementary algorithms are used to increase the speed, accuracy, and reliability of the queries.
    - Linear programming is used to map columns in a table to the columns in the seed set, maximizing the 'related score' of the mapping with the constraint that the mapping is bijective. Each column in a table is mapped to only one column, and each column in the seed set has only one column mapped to it. Additionally, this ensures that table with different structures can still be related. There is no need to arrange the columns of tables so that information matches up, as BareTQL will handle that for you. 
    - BM25 is used to rank the keyword search results in a quick and efficient manner. Originally designed for web-pages and documents, a table in the database is used to represent a document and the keywords given to the search engine are used as the keywords in BM25. A keyword appearing in the title of a table is deemed to be more important than the same keyword appearing in the table contents. 
- Much of the basic functionality of BareTQL is performed using SQL. The keyword search is predominantly a single SQL query, with the ranking of the results being the only exception for the data being returned to the user. However, set expansion uses a number of smaller SQL queries, coupled with a myriad of different algorithms written in javascript used to filter the tables in ways that SQL cannot. For instance, while SQL may be used to find cells in the database which match the seed set, scoring and ranking these matches is performed in javascript. In many instances, it is simply easier and indeed faster to implement these algorithms in javascript rather than in SQL. 
    - Some of the operations do not require SQL. Labelling columns as 'unique' and deleting columns are operations which influence the javascript, but have no effect on the queries performed. The exception are the slider values, which the queries use to further restrict the amount of similarity allowed in the cells which are returned to the user.

## BareTQL operations
 - For each operation, what input does it take, what output does it produce and how is tha mapping done?
    - Keyword search: The keyword search is the first major BareTQL operation that you will come across. Ultimately, it consists of searching for specific keywords across the database and being presented with the tables and rows which best match those keywords. It is also the simplest operation to use in BareTQL, as you just need to enter a comma separated list of keywords into the search bar and click "Submit Query". BareTQL then searches through the database available to it, and returns the top 20 tables which contain the keyword. If a keyword appears in the row of a table then only the row will appear. However, if the keyword appears in a title then that entire table will appear, allowing users to easily discover related terms to the keywords through similar tables.
    Clicking on a row will add it to the seed set found on the left hand side of your screen. Once this seed set is to your liking, you may continue on to the next screen where you may perform set expansion.
    - Set expansion: Set expansion is a far more complex operation than keyword search, as there are many more options available to the user. Nevertheless, operating the set expansion need not be any more difficult. To expand your seed set, the minimum operation for a user is just to click "Expand Rows". This will find the rows in your dataset which most closely match the rows in your seed set, rank them in terms of similarity, and return them to you. We use a "similarity score" between 0 and 1 for each row so that different operations with different settings can be compared to one another. The sliders are easily the most complicated setting available, and thus are described more in detail below. The remaining settings are "unique", "delete", and "row count". "Unique" labels a specific column to be, appropriately, unique. This means that all values can appear only once in your expanded rows, and can be useful when you want to add some diversity to a specific column in your dataset. "Delete" deletes columns from your seed set, and is used when irrelevant columns are in your seed set. Setting the slider of a column to "0" ultimately has the same effect as deleting a column, yet we keep the deletion buttons available in case you want to remove columns altogether. "Row Count" does exactly what it says: The number contained in the drop down is the *maximum* number of rows returned. Occasionally, BareTQL cannot find enough rows to fit your criteria and so a number of rows less than "Row Count" is returned. However, it will never be more than "Row Count". 
 - How do sliders affect each operation?
    - The slider value identifies the 'stickiness' of its respective column. "Stickiness" is abstractly defined to be the amount of similarity between the values in the seed set and the values in the expanded rows. This does not depend on the contextual similarity between two values (i.e. two cities being related simply due to the fact that they are cities) but instead the similarity of the words themselves or phrases themselves. More concretely, we draw a distinction between numerical and textual columns. If a numerical column has a high "stickiness" value, then we would only wish to see values that are relatively close to those values in the seed set (relative to the order of magnitude). Similarly, a low stickiness value implies that the distribution of the numbers in the expanded rows can be far more varied. For textual data, stickiness can be viewed as a measure of the ordering of the letters between two words. Sticky words will have letters which are in the same order ('part' and 'tart'). If you are familiar with the levenshtein distance, it is similar to that. 
    - Indeed, the stickiness value affects the ways in which the rows are ranked. But it also determines the tables from which the expanded rows originate, setting a 'threshold' by which a given table must be similar to the seed set. Therefore, the stickiness value impacts both the ranking of the rows and the tables which are filtered through.
    - It is important to note that small changes in the slider's values likely won't influence the output of the row expansion very much (unless your provided database is massive). This is because the slider values are weighted relative to each other. So a slider value of 50% will be weighted the same as two slider values of 25%. Therefore, if you want to ensure a single column is weighted as much as all others, set the slider values so that the single column's value is the same as the sum of the other sliders, e.g. 10%, 50%, 10%, 10%, 10%, 10%.
    - The exception to this rule is when the slider value is 100% or 0%. If the slider value is 100%, then the only allowed values in the expanded rows are those which are already in the seed set. This can be useful if you want to ensure a column remains the same across all expanded rows (i.e. country). Conversely, a slider value of 0% ensures the column has no impact on the expanded rows, and any values can appear in that column. This is somewhat equivalent to deleting the column altogether, differing only in that the expanded rows still contain that column.

## Other Notes
 - It looks like the left most column of each table is treated as a key column, the key column is matched before any other column. Is this right? Is there a way to support multi-column keys in seed and data?
    - This is correct. We use the left-most column to filter the initial set of tables in the database so that later filtering is not as time consuming. As of right now, there is no way to support multi-column keys in the seed set, although setting the "stickiness" value of specific columns to be high will cause those columns to act as "pseudo-keys".