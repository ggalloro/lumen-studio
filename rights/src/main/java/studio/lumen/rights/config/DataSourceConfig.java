package studio.lumen.rights.config;

import java.io.File;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

@Configuration
public class DataSourceConfig {

    private static final Logger LOG = LoggerFactory.getLogger(DataSourceConfig.class);

    public static final String DATABASE_FILE = "rights.db";

    @Value("${lumen.data-dir}")
    private String dataDir;

    @Bean
    public DataSource dataSource() {
        File dir = new File(dataDir);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Cannot create data directory " + dir.getAbsolutePath());
        }
        File dbFile = new File(dir, DATABASE_FILE);
        LOG.info("Using database {}", dbFile.getAbsolutePath());

        SQLiteConfig config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        // Writers wait up to 5 seconds for the lock instead of failing with SQLITE_BUSY.
        config.setBusyTimeout(5000);
        config.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);

        SQLiteDataSource ds = new SQLiteDataSource(config);
        ds.setUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
        return ds;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
