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

1. 


## Data Creation
In order to use BareTQL, you will need a database designed for BareTQL. Currently, BareTQL includes python scripts which accept `.csv` or `.xlsx` files and converts their contents to a SQLite database usable by BareTQL. BareTQL uses the python library `Pandas` to assist with converting the data, and so ensure that the format of the files is acceptable to `Pandas`. If you are not familiar with pandas, then simply ensure that the data is organized into columns and has no more than one row discussing the column names.
    - Move the files you wish to convert into the directory `../data_preprocessing/input`, and then run the file `../data.sh` with the cmd argument `make`. This will create the database in the directory `../program/server/data/database.db` using the files given. 
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
    
- This schema allows a table to be built on-the-fly, with custom rows and columns. Moreover, we ensure that the column type is preserved, with numerical columns being mapped to numerical columns, and textual columns mapped to textual columns. Most tables are rather self-explanatory, although there are a few additional criteria which speed up the querying. Each entry in the `cells` table includes its location (whether it is a normal cell or a header / sub-header in the table), which allows us to avoid costly joins when cross-referencing contents with the `titles` or `captions` table. Additionally, the `columns` table includes a `type` column, which assigns a column to be `numerical`, `textual`, or `NULL`. As stated above, this allows columns to be mapped only to columns with identical types and allows us to constrict the allowed mappings, accelerating the querying further. 

- In addition to the schema that is mentioned above, a number of supplementary algorithms are used to increase the speed, accuracy, and reliability of the queries.
    - Linear programming is used to map columns in a table to the columns in the seed set, maximizing the 'related score' of the mapping with the constraint that the mapping is bijective. Each column in a table is mapped to only one column, and each column in the seed set has only one column mapped to it. Additionally, this ensures that table with different structures can still be related. There is no need to arrange the columns of tables so that information matches up, as BareTQL will handle that for you. 
    - BM25 is used to rank the keyword search results in a quick and efficient manner. Originally designed for web-pages and documents, a table in the database is used to represent a document and the keywords given to the search engine are used as the keywords in BM25. A keyword appearing in the title of a table is deemed to be more important than the same keyword appearing in the table contents. 
- Much of the basic functionality of BareTQL is performed using SQL. The keyword search is predominantly a single SQL query, with the ranking of the results being the only exception for the data being returned to the user. However, set expansion uses a number of smaller SQL queries, coupled with a myriad of different algorithms written in javascript used to filter the tables in ways that SQL cannot. For instance, while SQL may be used to find cells in the database which match the seed set, scoring and ranking these matches is performed in javascript. In many instances, it is simply easier and indeed faster to implement these algorithms in javascript rather than in SQL. 
    - Some of the operations do not require SQL. Labelling columns as 'unique' and deleting columns are operations which influence the javascript, but have no effect on the queries performed. The exception are the slider values, which the queries use to further restrict the amount of similarity allowed in the cells which are returned to the user.

## BareTQL operations
 - For each operation, what input does it take, what output does it produce and how is tha mapping done?
    - Keyword search: 
    - Set expansion:
 - How do pins and sliders affect each operation?
    - The slider value identifies the 'stickiness' of its respective column. "Stickiness" is defined to be the amount of similarity between the values in the seed set and the values in the expanded rows. This does not relate the contextual similarity between two values (i.e. two cities being related simply due to the fact that they are cities) but instead the similarity of the words themselves. This is an abstract definition, and so it may be easier to think in terms of numerical columns. If a numerical column has a high "stickiness" value, then we would only wish to see values that are relatively close to those values in the seed set. Similarly, a low stickiness value implies that the distribution of the numbers in the expanded rows can be far more varied. For textual data, stickiness can be viewed as a measure of the ordering of the letters between two words. Sticky words will have letters which are in the same order ('part' and 'tart'). The words will still be related to each other since our initial filtering involves finding tables which have some overlap with the seed set. The stickiness value mainly affects the ranking of the rows which are returned to the user. 
 - It looks like the left most column of each table is treated as a key column, the key column is matched before any other column. Is this right? Is there a way to support multi-column keys in seed and data?
    - This is correct. We use the left-most column to filter the initial set of tables in the database so that later filtering is not as time consuming. As of right now, there is no way to support multi-column keys in the seed set, although setting the "stickiness" value of specific columns to be high will cause those columns to act as "pseudo-keys".
 - Given dataset, what are the steps for preprocessing and building a database f
or further querying?
    1. First, you must make sure your data is in `.csv` or `.xlsx` files.
    1. Then, move these files into the directory `../data_preprocessing/input`. 
    1. In a command line and in the parent directory, write `./data.sh make`. This will extract the tables from your files and insert them into a database, which will be located at `../program/server/data/database.db`. Now, simply follow the installation instructions above to run BareTQL_GUI!