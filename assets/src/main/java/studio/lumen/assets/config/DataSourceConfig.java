package studio.lumen.assets.config;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(LumenProperties props) {
        try {
            Files.createDirectories(props.dataDir());
            Files.createDirectories(props.blobDir());
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create data directory " + props.dataDir(), e);
        }

        SQLiteConfig config = new SQLiteConfig();
        config.enforceForeignKeys(true);
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.setBusyTimeout(5000);
        // Take the write lock at BEGIN so concurrent read-then-write transactions wait on the
        // busy timeout instead of failing with SQLITE_BUSY when they upgrade.
        config.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);

        SQLiteDataSource ds = new SQLiteDataSource(config);
        ds.setUrl("jdbc:sqlite:" + props.databaseFile().toAbsolutePath());
        return ds;
    }
}
